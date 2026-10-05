/**
 * Phase 6L: Security Testing Suite (Node)
 * DigiLab QA & Automated Testing Track
 *
 * Verifies that untrusted users, requests, headers, tokens, files,
 * queries, and cross-user operations cannot bypass the application's
 * security boundaries:
 *
 * 1.  JWT Token Security: 'none' algorithm rejection
 * 2.  JWT Token Security: wrong signing secret rejection
 * 3.  JWT Token Security: missing id/uid identity claim rejection
 * 4.  JWT Token Security: malformed identity payload rejection
 * 5.  Identity Spoofing: external client X-Authenticated-User-Id header stripped/ignored
 * 6.  Identity Spoofing: request body user_id cannot override authenticated token identity
 * 7.  Identity Spoofing: conflicting X-Guest-ID and Bearer token resolved securely
 * 8.  IDOR Protection: USER_A cannot view USER_B's DocumentJob upload status (403)
 * 9.  IDOR Protection: USER_A cannot retry USER_B's DocumentJob (403)
 * 10. IDOR Protection: USER_A cannot read USER_B's ChatSession messages (404/denied)
 * 11. IDOR Protection: USER_A cannot delete USER_B's ChatSession (404/denied)
 * 12. IDOR Protection: USER_A cannot overwrite or merge into USER_B's ChatSession
 * 13. Role Escalation: student role cannot access teacher-only endpoints (403)
 * 14. Role Escalation: forged role in request body cannot escalate token privileges
 * 15. Error-Based Bypass: Firestore outage during auth never elevates privileges to teacher/admin
 * 16. Sensitive Information Disclosure: error responses never leak secrets or database internals
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const jwt = require('jsonwebtoken');

const voiceController = require('../controllers/voiceController');
const voiceRoutes = require('./voiceRoutes');
const chatRoutes = require('./chatRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const ChatSession = require('../models/ChatSession');
const { ingestionQueue, ingestionWorker } = require('../services/ingestionQueue');
const guestQuotaMiddleware = require('../middleware/guestQuotaMiddleware');
const User = require('../models/User');

describe('Phase 6L: Security Testing Suite (Node)', () => {
    let app, server, baseUrl;
    let originalPythonPost, originalQueueAdd, originalSessionSave, originalUserFindById;
    let originalReserveQuota, originalCompensateQuota, originalGetGuestQuotaData;
    let tempDir, tempPdfPath;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6l';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (payload, options = { expiresIn: '1h' }) =>
        jwt.sign(payload, JWT_SECRET, options);

    before(async () => {
        originalPythonPost = voiceController.pythonClient.post;
        originalQueueAdd = ingestionQueue.add;
        originalSessionSave = ChatSession.prototype.save;
        originalUserFindById = User.findById;
        originalReserveQuota = guestQuotaMiddleware.reserveQuota;
        originalCompensateQuota = guestQuotaMiddleware.compensateQuota;
        originalGetGuestQuotaData = guestQuotaMiddleware.getGuestQuotaData;

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digilab-6l-node-'));
        tempPdfPath = path.join(tempDir, 'security_test.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from('%PDF-1.4 Security audit test content'));

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        // Route mounts
        app.use('/api/voice', voiceRoutes);
        app.use('/api/chat', chatRoutes);
        app.use('/api/dashboard', dashboardRoutes);
        app.use('/', voiceRoutes);

        // Global error handler
        app.use((err, req, res, next) => {
            const statusCode = res.statusCode && res.statusCode !== 200 ? res.statusCode : 500;
            res.status(statusCode).json({ message: err.message });
        });

        await new Promise((resolve) => {
            server = app.listen(0, () => {
                baseUrl = `http://127.0.0.1:${server.address().port}`;
                resolve();
            });
        });
    });

    after(async () => {
        voiceController.pythonClient.post = originalPythonPost;
        ingestionQueue.add = originalQueueAdd;
        ChatSession.prototype.save = originalSessionSave;
        User.findById = originalUserFindById;
        guestQuotaMiddleware.reserveQuota = originalReserveQuota;
        guestQuotaMiddleware.compensateQuota = originalCompensateQuota;
        guestQuotaMiddleware.getGuestQuotaData = originalGetGuestQuotaData;

        if (server) await new Promise((resolve) => server.close(resolve));
        if (tempDir && fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });

        try {
            await ingestionWorker.close();
            await ingestionQueue.close();
        } catch {
            // Ignore cleanup errors
        }
    });

    beforeEach(() => {
        voiceController.pythonClient.post = originalPythonPost;
        ingestionQueue.add = originalQueueAdd;
        ChatSession.prototype.save = originalSessionSave;
        User.findById = originalUserFindById;
        guestQuotaMiddleware.reserveQuota = async () => ({ messagesUsed: 1, limit: 5, sessionStarted: true });
        guestQuotaMiddleware.compensateQuota = async () => {};
        guestQuotaMiddleware.getGuestQuotaData = async () => ({ messagesUsed: 0, limit: 5, sessionStarted: false });
    });

    // ── 1. JWT Security & Algorithm Confusion ───────────────────────

    test('1. JWT with "none" algorithm is strictly rejected (HTTP 401)', async () => {
        // Construct an unsigned token with alg: none
        const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
        const payload = Buffer.from(JSON.stringify({ id: 'attacker-user', role: 'admin' })).toString('base64url');
        const noneToken = `${header}.${payload}.`;

        const res = await fetch(`${baseUrl}/api/chat/sessions`, {
            headers: { 'Authorization': `Bearer ${noneToken}` },
        });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.ok(data.message.toLowerCase().includes('not authorized'));
    });

    test('2. JWT signed with an untrusted secret is strictly rejected (HTTP 401)', async () => {
        const forgedToken = jwt.sign({ id: 'attacker-user', role: 'admin' }, 'different_attacker_secret');
        const res = await fetch(`${baseUrl}/api/chat/sessions`, {
            headers: { 'Authorization': `Bearer ${forgedToken}` },
        });
        assert.equal(res.status, 401);
    });

    test('3. JWT missing required id/uid claim is rejected with HTTP 401', async () => {
        const noIdToken = createToken({ role: 'admin', email: 'admin@example.com' });
        const res = await fetch(`${baseUrl}/api/chat/sessions`, {
            headers: { 'Authorization': `Bearer ${noIdToken}` },
        });
        assert.equal(res.status, 401);
        const data = await res.json();
        assert.ok(data.message.includes('token invalid'));
    });

    test('4. JWT with malformed/empty user identity is rejected (HTTP 401)', async () => {
        const emptyIdToken = createToken({ id: '', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/sessions`, {
            headers: { 'Authorization': `Bearer ${emptyIdToken}` },
        });
        assert.equal(res.status, 401);
    });

    // ── 2. Identity Spoofing & Header Isolation ─────────────────────

    test('5. Direct client sending X-Authenticated-User-Id cannot spoof identity to Python', async () => {
        let forwardedHeaders = null;
        voiceController.pythonClient.post = async (url, data, config) => {
            forwardedHeaders = config.headers;
            return { data: { answer: 'Mock answer', sources: [] } };
        };

        // Guest attempts to inject X-Authenticated-User-Id: admin-root
        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Guest-ID': 'guest-real-client',
                'X-Authenticated-User-Id': 'admin-root',
            },
            body: JSON.stringify({ question: 'Who am I?' }),
        });

        assert.equal(res.status, 200);
        assert.ok(forwardedHeaders, 'Forwarded headers must exist');
        // Node's pythonProxyHeaders MUST NOT trust the client's X-Authenticated-User-Id
        assert.equal(forwardedHeaders['X-Authenticated-User-Id'], undefined,
            'Untrusted client X-Authenticated-User-Id header must be stripped/ignored');
        assert.equal(forwardedHeaders['X-Guest-ID'], 'guest-real-client');
    });

    test('6. Authenticated user sending different body.user_id cannot impersonate victim', async () => {
        const attackerToken = createToken({ id: 'user-attacker-01', role: 'student' });
        let passedBody = null;
        let forwardedHeaders = null;

        voiceController.pythonClient.post = async (url, data, config) => {
            passedBody = data;
            forwardedHeaders = config.headers;
            return { data: { answer: 'Safe answer', sources: [] } };
        };

        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${attackerToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                question: 'What is ethics?',
                user_id: 'user-victim-02', // Attacker attempts to spoof user_id
            }),
        });

        assert.equal(res.status, 200);
        // Node overrides body.user_id with verified JWT identity
        assert.equal(passedBody.user_id, 'user-attacker-01', 'Server-side identity must override client body.user_id');
        assert.equal(forwardedHeaders['X-Authenticated-User-Id'], 'user-attacker-01');
    });

    test('7. Conflicting X-Guest-ID and Bearer token is strictly bound to authenticated token identity', async () => {
        const userToken = createToken({ id: 'user-charlie', role: 'student' });
        let forwardedHeaders = null;

        voiceController.pythonClient.post = async (url, data, config) => {
            forwardedHeaders = config.headers;
            return { data: { answer: 'OK', sources: [] } };
        };

        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${userToken}`,
                'X-Guest-ID': 'guest-spoofed-bucket',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question: 'Test conflicting auth' }),
        });

        assert.equal(res.status, 200);
        assert.equal(forwardedHeaders['X-Authenticated-User-Id'], 'user-charlie');
    });

    // ── 3. Authorization & IDOR Protection ──────────────────────────

    test('8. IDOR: USER_A cannot view USER_B DocumentJob upload status (HTTP 403)', async () => {
        const jobId = `job_idor_view_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId: 'doc_victim_99',
            userId: 'user_victim_bob',
            filename: 'private_research.pdf',
            status: STATUS.PROCESSING,
            stage: STAGE.PROCESSING,
        });

        const attackerToken = createToken({ id: 'user_attacker_alice', role: 'student' });

        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${attackerToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.message.includes('Not authorized to view this job'));
    });

    test('9. IDOR: USER_A cannot retry USER_B DocumentJob (HTTP 403)', async () => {
        const jobId = `job_idor_retry_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId: 'doc_victim_98',
            userId: 'user_victim_bob',
            filename: 'private_financial.pdf',
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'DOWNSTREAM_ERROR',
        });

        const attackerToken = createToken({ id: 'user_attacker_alice', role: 'student' });

        const res = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${attackerToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.message.includes('Not authorized to retry this job'));
    });

    test('10. IDOR: USER_A cannot read USER_B ChatSession messages (HTTP 404 / access denied)', async () => {
        const attackerToken = createToken({ id: 'user_attacker_alice', role: 'student' });

        // Mock ChatSession.findByIdWithPagination to return null when queried by different userId
        const originalFindByIdWithPag = ChatSession.findByIdWithPagination;
        ChatSession.findByIdWithPagination = async (sessionId, userId) => {
            if (userId === 'user_victim_bob') {
                return { id: sessionId, userId: 'user_victim_bob', messages: [{ role: 'user', content: 'Secret plans' }] };
            }
            return null; // Alice cannot find Bob's session
        };

        try {
            const res = await fetch(`${baseUrl}/api/chat/sessions/session_secret_bob/messages`, {
                headers: { 'Authorization': `Bearer ${attackerToken}` },
            });

            assert.equal(res.status, 404);
            const data = await res.json();
            assert.equal(data.message, 'Session not found');
        } finally {
            ChatSession.findByIdWithPagination = originalFindByIdWithPag;
        }
    });

    test('11. IDOR: USER_A cannot delete USER_B ChatSession (HTTP 404 / access denied)', async () => {
        const attackerToken = createToken({ id: 'user_attacker_alice', role: 'student' });

        const originalDeleteById = ChatSession.deleteById;
        ChatSession.deleteById = async (sessionId, userId) => {
            if (userId === 'user_victim_bob') return true;
            return false; // Alice cannot delete Bob's session
        };

        try {
            const res = await fetch(`${baseUrl}/api/chat/sessions/session_secret_bob`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${attackerToken}` },
            });

            assert.equal(res.status, 404);
            const data = await res.json();
            assert.equal(data.message, 'Session not found');
        } finally {
            ChatSession.deleteById = originalDeleteById;
        }
    });

    test('12. IDOR: USER_A posting session matching USER_B sessionId cannot overwrite or merge victim history', async () => {
        const attackerToken = createToken({ id: 'user_attacker_alice', role: 'student' });

        const originalFindById = ChatSession.findById;
        let savedSessionUserId = null;

        // When queried with Alice's userId, Bob's session is not found
        ChatSession.findById = async (sessionId, userId) => {
            if (userId === 'user_victim_bob') return { id: sessionId, userId: 'user_victim_bob', messages: [{ role: 'user', content: 'Secret' }] };
            return null;
        };

        ChatSession.prototype.save = async function() {
            savedSessionUserId = this.userId;
            return this;
        };

        try {
            const res = await fetch(`${baseUrl}/api/chat/sessions`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${attackerToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    sessionId: 'session_target_bob',
                    messages: [{ role: 'user', content: 'Tampered message' }],
                }),
            });

            assert.equal(res.status, 200);
            assert.equal(savedSessionUserId, 'user_attacker_alice', 'Saved session must be strictly bound to authenticated user');
        } finally {
            ChatSession.findById = originalFindById;
        }
    });

    // ── 4. Role Escalation Prevention ───────────────────────────────

    test('13. Student role is forbidden from accessing teacher-only routes (HTTP 403)', async () => {
        const studentToken = createToken({ id: 'student-eve', role: 'student' });
        const res = await fetch(`${baseUrl}/api/dashboard/teacher-stats`, {
            headers: { 'Authorization': `Bearer ${studentToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.message.includes('not authorized to access this route'));
    });

    test('14. Body role tampering does not escalate privileges on protected endpoints', async () => {
        const studentToken = createToken({ id: 'student-eve', role: 'student' });
        const res = await fetch(`${baseUrl}/api/dashboard/teacher-stats`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${studentToken}`,
                'Content-Type': 'application/json',
                'role': 'teacher',
            },
        });

        assert.equal(res.status, 403);
    });

    // ── 5. Error-Based Bypass & Information Disclosure ──────────────

    test('15. Firestore outage during auth never elevates privileges to teacher or admin', async () => {
        User.findById = async () => {
            throw new Error('Firestore connection timed out');
        };

        const normalStudentToken = createToken({ id: 'student-dan', role: 'student' });

        // Attempt to access teacher stats during DB outage
        const res = await fetch(`${baseUrl}/api/dashboard/teacher-stats`, {
            headers: { 'Authorization': `Bearer ${normalStudentToken}` },
        });

        // Must still be 403 Forbidden (never fail-open)
        assert.equal(res.status, 403);
        const data = await res.json();
        assert.ok(data.message.includes('not authorized'));
    });

    test('16. Downstream failures and health checks never disclose server secrets or stack traces', async () => {
        voiceController.pythonClient.post = async () => {
            const err = new Error('connect ECONNREFUSED 127.0.0.1:8000');
            err.code = 'ECONNREFUSED';
            err.stack = 'Error at InternalSecretModule (/server/secrets/keys.js:42:15)';
            throw err;
        };

        const token = createToken({ id: 'user-probe', role: 'student' });
        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ question: 'Test leak' }),
        });

        assert.equal(res.status, 500);
        const data = await res.json();
        const responseText = JSON.stringify(data);
        assert.ok(!responseText.includes(JWT_SECRET), 'Error response must not leak JWT_SECRET');
        assert.ok(!responseText.includes('/server/secrets'), 'Error response must not leak internal stack traces');

        // Health check failure does not leak secrets
        const originalGet = voiceController.pythonClient.get;
        try {
            voiceController.pythonClient.get = async () => {
                const err = new Error('connect ECONNREFUSED 127.0.0.1:8000');
                err.code = 'ECONNREFUSED';
                throw err;
            };
            const healthRes = await fetch(`${baseUrl}/api/voice/health`);
            assert.equal(healthRes.status, 503);
            const healthData = await healthRes.json();
            assert.ok(!JSON.stringify(healthData).includes(JWT_SECRET));
        } finally {
            voiceController.pythonClient.get = originalGet;
        }
    });
});
