/**
 * Phase 6B: Node API & Contract Testing Suite
 * DigiLab QA & Automated Testing Track
 *
 * Validates Express routes, proxy contracts to Python, status codes,
 * request validation, identity propagation, and error mappings.
 */

const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const express = require('express');
const jwt = require('jsonwebtoken');

const voiceController = require('../controllers/voiceController');
const voiceRoutes = require('./voiceRoutes');
const chatRoutes = require('./chatRoutes');
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const { ingestionQueue, ingestionWorker } = require('../services/ingestionQueue');

describe('Phase 6B: Node API Contracts & Python Proxying', () => {
    let app;
    let server;
    let baseUrl;
    let originalPythonPost;
    let originalPythonGet;
    let originalQueueAdd;
    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6b';
    process.env.JWT_SECRET = JWT_SECRET;

    const createAuthToken = (id = 'user-alice-123', role = 'student') => {
        return jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '1h' });
    };

    before(async () => {
        // Save original axios methods on pythonClient
        originalPythonPost = voiceController.pythonClient.post;
        originalPythonGet = voiceController.pythonClient.get;
        originalQueueAdd = ingestionQueue.add;

        // Build test Express application with relevant route mounts
        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        // Mount routes
        app.use('/api/voice', voiceRoutes);
        app.use('/api/chat', chatRoutes);
        app.use('/', voiceRoutes); // root mounts for /health, /chat

        // Start on ephemeral port
        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        // Restore methods
        voiceController.pythonClient.post = originalPythonPost;
        voiceController.pythonClient.get = originalPythonGet;
        ingestionQueue.add = originalQueueAdd;

        // Close server and BullMQ connections
        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await ingestionWorker.close();
        await ingestionQueue.close();
    });

    beforeEach(() => {
        // Mock queue.add by default to prevent Redis network traffic
        ingestionQueue.add = async (name, data, opts) => ({ id: `mock-${data.jobId}` });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Health Endpoint Contract
    // ─────────────────────────────────────────────────────────────
    test('1. GET /health returns 200 and Integrated-AI-Bridge envelope when Python responds', async () => {
        voiceController.pythonClient.get = async (url) => {
            if (url.includes('/health')) {
                return {
                    status: 200,
                    data: {
                        status: 'ok',
                        message: 'Python backend operational',
                        chatbot_ready: true,
                        speech_ready: true,
                        db_connected: true,
                    },
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.status, 200);

        const body = await res.json();
        assert.equal(body.status, 'healthy');
        assert.equal(body.service, 'Integrated-AI-Bridge');
        assert.equal(body.backend.status, 'ok');
        assert.equal(body.backend.chatbot_ready, true);
    });

    test('2. GET /health returns 503 degraded envelope when Python backend is unreachable', async () => {
        voiceController.pythonClient.get = async () => {
            const err = new Error('connect ECONNREFUSED 127.0.0.1:8000');
            err.code = 'ECONNREFUSED';
            throw err;
        };

        const res = await fetch(`${baseUrl}/health`);
        assert.equal(res.status, 503);

        const body = await res.json();
        assert.equal(body.status, 'starting');
        assert.equal(body.service, 'Integrated-AI-Bridge');
        assert.equal(body.backend, 'unavailable');
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Python Proxy Headers & Identity Propagation Contract
    // ─────────────────────────────────────────────────────────────
    test('3. pythonProxyHeaders helper generates correct identity headers', () => {
        // Guest request
        const guestReq = {
            guestId: 'guest-xyz-789',
            headers: {},
        };
        const guestHeaders = voiceController.pythonProxyHeaders(guestReq);
        assert.equal(guestHeaders['X-Guest-ID'], 'guest-xyz-789');
        assert.equal(guestHeaders['X-Authenticated-User-Id'], undefined);

        // Authenticated request with Bearer token
        const token = createAuthToken('user-carol-456');
        const authReq = {
            guestId: 'guest-fallback',
            headers: {
                authorization: `Bearer ${token}`,
            },
        };
        const authHeaders = voiceController.pythonProxyHeaders(authReq);
        assert.equal(authHeaders.Authorization, `Bearer ${token}`);
        assert.equal(authHeaders['X-Authenticated-User-Id'], 'user-carol-456');
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Guest Classification Middleware Contract
    // ─────────────────────────────────────────────────────────────
    test('4. POST /chat without Authorization or X-Guest-ID returns 400 rejection', async () => {
        const res = await fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: 'Hello' }),
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.message, 'X-Guest-ID header is required for guest requests');
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Chat Endpoint Proxy Contract
    // ─────────────────────────────────────────────────────────────
    test('5. POST /chat forwards request, user_id, and identity headers to Python', async () => {
        let capturedCall = null;
        voiceController.pythonClient.post = async (url, data, config) => {
            if (url.includes('/chat')) {
                capturedCall = { url, data, headers: config?.headers };
                return {
                    status: 200,
                    data: {
                        answer: 'Photosynthesis is...',
                        sources: [],
                        expanded_queries: ['photosynthesis'],
                        validation: null,
                    },
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        };

        const token = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question: 'Explain photosynthesis' }),
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.answer, 'Photosynthesis is...');

        assert.ok(capturedCall, 'Expected downstream Python /chat call');
        assert.equal(capturedCall.data.question, 'Explain photosynthesis');
        assert.equal(capturedCall.data.user_id, 'user-alice-123');
        assert.equal(capturedCall.headers['X-Authenticated-User-Id'], 'user-alice-123');
    });

    test('6. POST /chat with valid auth returns 500 error contract when Python backend is down', async () => {
        voiceController.pythonClient.post = async () => {
            const netErr = new Error('connect ECONNREFUSED 127.0.0.1:8000');
            netErr.code = 'ECONNREFUSED';
            throw netErr;
        };

        const token = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ question: 'Test question' }),
        });

        assert.equal(res.status, 500);
        const body = await res.json();
        assert.equal(body.message, 'Chat failed');
        assert.match(body.detail, /ECONNREFUSED/);
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Voice Request Validation Contract
    // ─────────────────────────────────────────────────────────────
    test('7. POST /api/voice/speech-to-speech returns 400 when audio_base64 is missing', async () => {
        const token = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/api/voice/speech-to-speech`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ mime_type: 'audio/wav' }), // audio_base64 missing
        });

        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.message, 'No audio data provided');
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Document Upload Contract (POST /api/chat/upload)
    // ─────────────────────────────────────────────────────────────
    test('8. POST /api/chat/upload returns 401 when Authorization token is missing', async () => {
        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
        });
        assert.equal(res.status, 401);
        const body = await res.json();
        assert.match(body.message, /Not authorized/);
    });

    test('9. POST /api/chat/upload returns 400 when no file is uploaded', async () => {
        const token = createAuthToken('user-uploader-1');
        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        assert.equal(res.status, 400);
        const body = await res.json();
        assert.equal(body.message, 'No file uploaded');
    });

    test('10. POST /api/chat/upload returns 202 Accepted and queues DocumentJob for PDF', async () => {
        const token = createAuthToken('user-uploader-1');

        // Construct multipart/form-data using FormData
        const formData = new FormData();
        const fakePdf = new Blob(['%PDF-1.4 Mock PDF content'], { type: 'application/pdf' });
        formData.append('file', fakePdf, 'course_syllabus.pdf');

        let queuedJobData = null;
        ingestionQueue.add = async (name, data) => {
            queuedJobData = data;
            return { id: `bull-${data.jobId}` };
        };

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        assert.equal(res.status, 202);
        const body = await res.json();
        assert.equal(body.message, 'Document uploaded and queued for processing');
        assert.equal(body.status, STATUS.QUEUED);
        assert.equal(body.originalName, 'course_syllabus.pdf');
        assert.ok(body.jobId);
        assert.ok(body.documentId);

        // Verify job record was stored
        assert.ok(queuedJobData);
        assert.equal(queuedJobData.filename, 'course_syllabus.pdf');
        assert.equal(queuedJobData.userId, 'user-uploader-1');

        const savedJob = await DocumentJob.getById(body.jobId);
        assert.equal(savedJob.status, STATUS.QUEUED);
        assert.equal(savedJob.filename, 'course_syllabus.pdf');
    });

    test('11. POST /api/chat/upload returns 200 for non-document uploads (images/audio)', async () => {
        const token = createAuthToken('user-uploader-1');

        const formData = new FormData();
        const fakeImage = new Blob(['fake_png_data'], { type: 'image/png' });
        formData.append('file', fakeImage, 'avatar.png');

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
            },
            body: formData,
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.message, 'File uploaded successfully');
        assert.equal(body.originalName, 'avatar.png');
        assert.equal(body.mimeType, 'image/png');
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Document Job Status Contract (GET /api/chat/upload-status/:jobId)
    // ─────────────────────────────────────────────────────────────
    test('12. GET /api/chat/upload-status/:jobId returns 401 when token is missing', async () => {
        const res = await fetch(`${baseUrl}/api/chat/upload-status/job-123`);
        assert.equal(res.status, 401);
    });

    test('13. GET /api/chat/upload-status/:jobId returns 404 for non-existent job', async () => {
        const token = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/api/chat/upload-status/non_existent_job_999`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res.status, 404);
        const body = await res.json();
        assert.equal(body.message, 'Job not found');
    });

    test('14. GET /api/chat/upload-status/:jobId returns 403 when user does not own job', async () => {
        const jobId = 'job-owned-by-bob';
        await DocumentJob.create({
            jobId,
            userId: 'user-bob-999',
            filename: 'bobs_doc.pdf',
            status: STATUS.PROCESSING,
        });

        // Alice tries to access Bob's job
        const tokenAlice = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { Authorization: `Bearer ${tokenAlice}` },
        });

        assert.equal(res.status, 403);
        const body = await res.json();
        assert.equal(body.message, 'Not authorized to view this job');
    });

    test('15. GET /api/chat/upload-status/:jobId returns 200 with job payload for owner', async () => {
        const jobId = 'job-owned-by-alice';
        await DocumentJob.create({
            jobId,
            userId: 'user-alice-123',
            filename: 'alices_syllabus.pdf',
            status: STATUS.READY,
            stage: STAGE.READY,
        });

        const tokenAlice = createAuthToken('user-alice-123');
        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { Authorization: `Bearer ${tokenAlice}` },
        });

        assert.equal(res.status, 200);
        const body = await res.json();
        assert.equal(body.jobId, jobId);
        assert.equal(body.userId, 'user-alice-123');
        assert.equal(body.status, STATUS.READY);
        assert.equal(body.stage, STAGE.READY);
    });
});
