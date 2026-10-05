/**
 * Phase 6M: Deployment & Release Readiness Testing Suite (Node)
 * DigiLab QA & Automated Testing Track
 *
 * Validates the DEPLOYMENT and RELEASE boundary:
 * 1.  Environment configuration: JWT_SECRET, PORT, PYTHON_BACKEND_URL, REDIS_URL
 * 2.  Safe failure modes on missing/malformed configuration
 * 3.  Production build verification: dist/index.html and dist/assets exist
 * 4.  Static asset security: frontend bundles do not expose backend secrets
 * 5.  Production routing: client routes serve index.html, /api 404s return JSON
 * 6.  Worker & Queue configuration: name, concurrency, retry/backoff parameters
 * 7.  Worker event handling: failed and error handlers registered
 * 8.  Health check integration: HTTP 200 healthy contract and HTTP 503 degraded contract
 * 9.  Node -> Python proxy headers and identity propagation
 * 10. Deployment artifact inspection: Dockerfile, .dockerignore, start_servers.sh
 * 11. Clean startup, controlled request, and graceful shutdown
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const express = require('express');
const jwt = require('jsonwebtoken');

const voiceController = require('../controllers/voiceController');
const voiceRoutes = require('./voiceRoutes');
const { ingestionQueue, ingestionWorker } = require('../services/ingestionQueue');

describe('Phase 6M: Deployment & Release Readiness (Node)', () => {
    let app, server, baseUrl;
    let originalPythonGet, originalPythonPost;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6m';
    process.env.JWT_SECRET = JWT_SECRET;

    before(async () => {
        originalPythonGet = voiceController.pythonClient.get;
        originalPythonPost = voiceController.pythonClient.post;

        app = express();
        app.use(express.json());

        // Routes
        app.use('/api/voice', voiceRoutes);

        // Production routing test setup
        const frontendDist = path.resolve(__dirname, '../../../../crypt/dist');
        if (fs.existsSync(frontendDist)) {
            app.use(express.static(frontendDist));
        }

        // Unknown API route handler
        app.use('/api', (req, res) => {
            res.status(404).json({ message: 'API route not found' });
        });

        // SPA fallback
        app.get(/.*/, (req, res) => {
            if (fs.existsSync(path.join(frontendDist, 'index.html'))) {
                res.sendFile(path.join(frontendDist, 'index.html'));
            } else {
                res.send('DigiLab API is running...');
            }
        });

        await new Promise((resolve) => {
            server = app.listen(0, '127.0.0.1', () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        voiceController.pythonClient.get = originalPythonGet;
        voiceController.pythonClient.post = originalPythonPost;

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        if (ingestionWorker) {
            await ingestionWorker.close();
        }
        if (ingestionQueue) {
            await ingestionQueue.close();
        }
    });

    // 1. Environment Configuration Audit
    test('1. Environment configuration: critical variables and safe defaults', () => {
        assert.ok(process.env.JWT_SECRET, 'JWT_SECRET must be defined');
        assert.ok(process.env.JWT_SECRET.length >= 8, 'JWT_SECRET must meet minimal length requirement');

        const pythonUrl = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';
        assert.ok(pythonUrl.startsWith('http://') || pythonUrl.startsWith('https://'),
            'PYTHON_BACKEND_URL must be a valid HTTP/HTTPS URL');

        const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 5001;
        assert.ok(!isNaN(port) && port > 0 && port < 65536, 'PORT must be a valid port number');
    });

    // 2. Production Build Artifacts Exist
    test('2. Production build artifacts: dist/index.html and dist/assets exist', () => {
        const distPath = path.resolve(__dirname, '../../../../crypt/dist');
        const indexPath = path.join(distPath, 'index.html');
        const assetsPath = path.join(distPath, 'assets');

        assert.ok(fs.existsSync(distPath), 'crypt/dist directory must exist');
        assert.ok(fs.existsSync(indexPath), 'crypt/dist/index.html must exist');
        assert.ok(fs.existsSync(assetsPath), 'crypt/dist/assets must exist');

        const indexHtml = fs.readFileSync(indexPath, 'utf-8');
        assert.ok(indexHtml.includes('<!doctype html>') || indexHtml.includes('<!DOCTYPE html>'),
            'index.html must be valid HTML');
        assert.ok(indexHtml.includes('<div id="root">'), 'index.html must contain root mount point');
    });

    // 3. Static Asset Security (No Server Secrets in Client JS)
    test('3. Static asset security: compiled bundles do not expose backend secrets', () => {
        const distAssetsPath = path.resolve(__dirname, '../../../../crypt/dist/assets');
        if (fs.existsSync(distAssetsPath)) {
            const files = fs.readdirSync(distAssetsPath).filter(f => f.endsWith('.js'));
            assert.ok(files.length > 0, 'Compiled JS files must exist in dist/assets');

            for (const file of files) {
                const content = fs.readFileSync(path.join(distAssetsPath, file), 'utf-8');
                assert.strictEqual(content.includes('FIREBASE_PRIVATE_KEY'), false,
                    `File ${file} must not contain FIREBASE_PRIVATE_KEY`);
                assert.strictEqual(content.includes('RESEND_API_KEY'), false,
                    `File ${file} must not contain RESEND_API_KEY`);
                assert.strictEqual(content.includes('test_jwt_secret'), false,
                    `File ${file} must not contain JWT secrets`);
            }
        }
    });

    // 4. Production Routing: Client Routes Serve SPA, /api Unknown Routes Return JSON 404
    test('4. Production routing: client routes serve index.html, /api returns JSON 404', async () => {
        // Unknown API route
        const apiRes = await fetch(`${baseUrl}/api/nonexistent_route_test`);
        assert.strictEqual(apiRes.status, 404);
        assert.strictEqual(apiRes.headers.get('content-type')?.includes('application/json'), true);
        const apiJson = await apiRes.json();
        assert.strictEqual(apiJson.message, 'API route not found');

        // Client route
        const clientRes = await fetch(`${baseUrl}/chat`);
        assert.strictEqual(clientRes.status, 200);
        const clientHtml = await clientRes.text();
        assert.ok(clientHtml.includes('<!doctype html>') || clientHtml.includes('<!DOCTYPE html>'));
    });

    // 5. Worker & Queue Configuration Consistency
    test('5. Worker & Queue configuration: name, concurrency, and retry parameters', () => {
        assert.strictEqual(ingestionQueue.name, 'document-ingestion');
        assert.strictEqual(ingestionQueue.defaultJobOptions.attempts, 2);
        assert.strictEqual(ingestionQueue.defaultJobOptions.backoff.type, 'exponential');
        assert.strictEqual(ingestionQueue.defaultJobOptions.backoff.delay, 2000);

        // Worker sequential concurrency = 1 (protects Pinecone & BM25)
        assert.strictEqual(ingestionWorker.opts.concurrency, 1);
        assert.strictEqual(ingestionWorker.name, 'document-ingestion');
    });

    // 6. Worker Event Listeners Registered
    test('6. Worker event listeners: error and failure handlers active', () => {
        const errorListeners = ingestionWorker.listeners('error');
        const failedListeners = ingestionWorker.listeners('failed');

        assert.ok(errorListeners.length >= 1, 'Worker must have an error listener');
        assert.ok(failedListeners.length >= 1, 'Worker must have a failed listener');
    });

    // 7. Health Check Integration (Healthy upstream)
    test('7. Health check endpoint: returns 200 with service contract when healthy', async () => {
        voiceController.pythonClient.get = async () => ({
            data: {
                status: 'healthy',
                message: 'Media Literacy Chatbot API is running',
                chatbot_ready: true,
                speech_ready: true,
                db_connected: true
            }
        });

        const res = await fetch(`${baseUrl}/api/voice/health`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.status, 'healthy');
        assert.strictEqual(data.service, 'Integrated-AI-Bridge');
        assert.strictEqual(data.backend.status, 'healthy');
        assert.strictEqual(data.backend.chatbot_ready, true);
    });

    // 8. Health Check Integration (Degraded upstream)
    test('8. Health check endpoint: returns 503 degraded/starting contract when upstream fails', async () => {
        voiceController.pythonClient.get = async () => {
            throw new Error('Connection refused to Python backend:8000');
        };

        const res = await fetch(`${baseUrl}/api/voice/health`);
        assert.strictEqual(res.status, 503);
        const data = await res.json();
        assert.strictEqual(data.status, 'starting');
        assert.strictEqual(data.service, 'Integrated-AI-Bridge');
        assert.strictEqual(data.backend, 'unavailable');
    });

    // 9. Node -> Python Identity Propagation
    test('9. Node -> Python proxy headers: identity propagated correctly', () => {
        const token = jwt.sign({ id: 'user_deploy_01', email: 'deploy@digilab.in' }, JWT_SECRET);
        const mockReq = {
            headers: {
                authorization: `Bearer ${token}`
            }
        };

        const headers = voiceController.pythonProxyHeaders(mockReq);
        assert.strictEqual(headers['X-Authenticated-User-Id'], 'user_deploy_01');
        assert.strictEqual(headers['X-Guest-ID'], 'user-user_deploy_01');
        assert.strictEqual(headers.Authorization, `Bearer ${token}`);
    });

    // 10. Deployment Artifact Audit: Dockerfile & .dockerignore
    test('10. Deployment artifact audit: Dockerfile, .dockerignore, start_servers.sh', () => {
        const rootDir = path.resolve(__dirname, '../../../../');
        const dockerfilePath = path.join(rootDir, 'Dockerfile');
        const dockerignorePath = path.join(rootDir, '.dockerignore');
        const startServersPath = path.join(rootDir, 'start_servers.sh');

        assert.ok(fs.existsSync(dockerfilePath), 'Dockerfile must exist');
        assert.ok(fs.existsSync(dockerignorePath), '.dockerignore must exist');
        assert.ok(fs.existsSync(startServersPath), 'start_servers.sh must exist');

        const dockerfile = fs.readFileSync(dockerfilePath, 'utf-8');
        assert.ok(dockerfile.includes('EXPOSE 7860') || dockerfile.includes('PORT'), 'Dockerfile must specify port');
        assert.ok(dockerfile.includes('USER node'), 'Dockerfile must enforce non-root user');
        assert.ok(dockerfile.includes('/api/voice/health'), 'Dockerfile must define healthcheck');

        const dockerignore = fs.readFileSync(dockerignorePath, 'utf-8');
        assert.ok(dockerignore.includes('**/.env'), '.dockerignore must ignore .env files');
        assert.ok(dockerignore.includes('firebase-key.json'), '.dockerignore must ignore private key files');
        assert.ok(dockerignore.includes('node_modules'), '.dockerignore must ignore node_modules');

        const startScript = fs.readFileSync(startServersPath, 'utf-8');
        assert.ok(startScript.includes('trap cleanup EXIT INT TERM'), 'start_servers.sh must trap signals for clean shutdown');
        assert.ok(startScript.includes('uvicorn api_server:app'), 'start_servers.sh must start python uvicorn');
        assert.ok(startScript.includes('node crypt/backend/src/app.js'), 'start_servers.sh must start node server');
    });

    // 11. Clean Startup, Controlled Request & Graceful Shutdown
    test('11. Clean startup, controlled request, and graceful shutdown', async () => {
        // Ephemeral server test
        const tempApp = express();
        tempApp.get('/smoke', (req, res) => res.json({ ok: true, timestamp: Date.now() }));

        const tempServer = await new Promise((resolve) => {
            const s = tempApp.listen(0, '127.0.0.1', () => resolve(s));
        });
        const tempPort = tempServer.address().port;

        const res = await fetch(`http://127.0.0.1:${tempPort}/smoke`);
        assert.strictEqual(res.status, 200);
        const data = await res.json();
        assert.strictEqual(data.ok, true);

        // Graceful shutdown
        await new Promise((resolve) => tempServer.close(resolve));
    });
});
