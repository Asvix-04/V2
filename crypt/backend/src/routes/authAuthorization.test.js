/**
 * Phase 6E: Authentication & Authorization Test Suite
 * DigiLab QA & Automated Testing Track
 *
 * Verifies the system's security and access control contracts:
 * 1. Missing credentials rejection
 * 2. Malformed credentials rejection
 * 3. Invalid JWT signature rejection
 * 4. Expired JWT rejection
 * 5. Missing required JWT identity rejection
 * 6. Valid authenticated user access
 * 7. Guest user validation and access restrictions
 * 8. Authenticated identity propagation to Python proxy headers
 * 9. Guest identity propagation to Python proxy headers
 * 10. USER_A access to own resource succeeds
 * 11. USER_B cross-user access to USER_A resource rejected with 403
 * 12. Guest access to USER_A protected resource rejected with 401
 * 13. Client identity tampering / body spoofing prevention
 * 14. Role-based authorization (student vs teacher)
 * 15. Stateless token drop / logout simulation
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');

const voiceController = require('../controllers/voiceController');
const voiceRoutes = require('./voiceRoutes');
const chatRoutes = require('./chatRoutes');
const dashboardRoutes = require('./dashboardRoutes');
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const { ingestionQueue, ingestionWorker } = require('../services/ingestionQueue');
const { classifyUser } = require('../middleware/guestQuotaMiddleware');

describe('Phase 6E: Authentication & Authorization Security Suite', () => {
    let app;
    let server;
    let baseUrl;
    let originalPythonPost;
    let originalQueueAdd;
    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6e';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (payload, options = { expiresIn: '1h' }) => {
        return jwt.sign(payload, JWT_SECRET, options);
    };

    before(async () => {
        originalPythonPost = voiceController.pythonClient.post;
        originalQueueAdd = ingestionQueue.add;

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        // Test endpoint to verify classifyUser behavior directly
        app.get('/api/test-classification', classifyUser, (req, res) => {
            res.json({ isGuest: req.isGuest, guestId: req.guestId, userId: req.userId });
        });

        // Mount routes under test
        app.use('/api/voice', voiceRoutes);
        app.use('/api/chat', chatRoutes);
        app.use('/api/dashboard', dashboardRoutes);

        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        voiceController.pythonClient.post = originalPythonPost;
        ingestionQueue.add = originalQueueAdd;

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await ingestionWorker.close();
        await ingestionQueue.close();
    });

    beforeEach(() => {
        ingestionQueue.add = async () => ({ id: 'mock-job' });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Missing & Malformed Credentials (Section 5)
    // ─────────────────────────────────────────────────────────────
    test('1. Protected route rejects request when Authorization header is missing', async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/common`);
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, no token');
    });

    test('2. Protected route rejects request when Authorization header uses unsupported scheme', async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: 'Basic dXNlcjpwYXNzd29yZA==' },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, no token');
    });

    test('3. Protected route rejects request when Bearer token is empty or whitespace', async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: 'Bearer   ' },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, token invalid');
    });

    test('4. Protected route rejects request when Bearer token is completely malformed', async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: 'Bearer definitely-not-a-valid-jwt' },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, token invalid');
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Invalid, Expired & Corrupted JWT Validation (Section 6)
    // ─────────────────────────────────────────────────────────────
    test('5. Protected route rejects JWT with invalid cryptographic signature', async () => {
        const forgedToken = jwt.sign({ id: 'user-hacker', role: 'teacher' }, 'untrusted_attacker_secret');
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: `Bearer ${forgedToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, token invalid');
    });

    test('6. Protected route rejects expired JWT', async () => {
        const expiredToken = jwt.sign(
            { id: 'user-expired', role: 'student' },
            JWT_SECRET,
            { expiresIn: '-10s' }
        );
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: `Bearer ${expiredToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, token invalid');
    });

    test('7. Protected route rejects JWT missing required id/uid identity claim', async () => {
        const emptyClaimToken = createToken({ email: 'noid@example.com' });
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: `Bearer ${emptyClaimToken}` },
        });

        // Middleware either finds no user id in token or fails lookup -> 401
        assert.equal(res.status, 401);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Authenticated Identity & Permissions (Section 7)
    // ─────────────────────────────────────────────────────────────
    test('8. Valid authenticated student token accesses permitted resource and receives identity', async () => {
        const token = createToken({ id: 'user-alice-101', name: 'Alice', role: 'student' });
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.role, 'student');
        assert.match(data.message, /common data for all roles/i);
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Role Authorization (Section 11)
    // ─────────────────────────────────────────────────────────────
    test('9. Student role can access student-progress route', async () => {
        const studentToken = createToken({ id: 'user-student-1', role: 'student' });
        const res = await fetch(`${baseUrl}/api/dashboard/student-progress`, {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.message, 'Welcome to the Student Dashboard');
    });

    test('10. Student role is forbidden from accessing teacher-stats route (403)', async () => {
        const studentToken = createToken({ id: 'user-student-1', role: 'student' });
        const res = await fetch(`${baseUrl}/api/dashboard/teacher-stats`, {
            headers: { Authorization: `Bearer ${studentToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 403);
        assert.equal(data.message, 'User role student is not authorized to access this route');
    });

    test('11. Teacher role can access teacher-stats route', async () => {
        const teacherToken = createToken({ id: 'user-teacher-1', role: 'teacher' });
        const res = await fetch(`${baseUrl}/api/dashboard/teacher-stats`, {
            headers: { Authorization: `Bearer ${teacherToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.message, 'Welcome to the Teacher Dashboard');
    });

    test('12. Teacher role is forbidden from accessing student-progress route (403)', async () => {
        const teacherToken = createToken({ id: 'user-teacher-1', role: 'teacher' });
        const res = await fetch(`${baseUrl}/api/dashboard/student-progress`, {
            headers: { Authorization: `Bearer ${teacherToken}` },
        });
        const data = await res.json();

        assert.equal(res.status, 403);
        assert.equal(data.message, 'User role teacher is not authorized to access this route');
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Guest Access Boundary (Section 8)
    // ─────────────────────────────────────────────────────────────
    test('13. Public route with classifyUser middleware accepts guest with X-Guest-ID header', async () => {
        const res = await fetch(`${baseUrl}/api/test-classification`, {
            headers: {
                'X-Guest-ID': 'guest_charlie_777',
            },
        });
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.isGuest, true);
        assert.equal(data.guestId, 'guest_charlie_777');
    });

    test('14. Public route with classifyUser middleware rejects guest when X-Guest-ID is missing', async () => {
        const res = await fetch(`${baseUrl}/api/test-classification`);
        const data = await res.json();

        assert.equal(res.status, 400);
        assert.equal(data.message, 'X-Guest-ID header is required for guest requests');
    });

    test('15. Guest request with X-Guest-ID cannot access protected routes without JWT (401)', async () => {
        const res = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { 'X-Guest-ID': 'guest_charlie_777' },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, no token');
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Cross-User Authorization & Ownership Protection (Section 9)
    // ─────────────────────────────────────────────────────────────
    test('16. USER_A can access their own document job status', async () => {
        const userA_id = 'user-alice-owner';
        const userA_token = createToken({ id: userA_id, role: 'student' });
        const jobId = 'job_auth_alice_' + Date.now();

        await DocumentJob.create({
            jobId,
            userId: userA_id,
            filename: 'alice_research.pdf',
            status: STATUS.PROCESSING,
            stage: STAGE.EXTRACTING,
        });

        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { Authorization: `Bearer ${userA_token}` },
        });
        const data = await res.json();

        assert.equal(res.status, 200);
        assert.equal(data.jobId, jobId);
        assert.equal(data.userId, userA_id);
    });

    test('17. USER_B cannot access USER_A document job status (403 Forbidden)', async () => {
        const userA_id = 'user-alice-owner';
        const userB_id = 'user-bob-attacker';
        const userB_token = createToken({ id: userB_id, role: 'student' });
        const jobId = 'job_auth_private_' + Date.now();

        await DocumentJob.create({
            jobId,
            userId: userA_id,
            filename: 'alice_confidential.pdf',
            status: STATUS.PROCESSING,
            stage: STAGE.EXTRACTING,
        });

        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { Authorization: `Bearer ${userB_token}` },
        });
        const data = await res.json();

        assert.equal(res.status, 403);
        assert.equal(data.message, 'Not authorized to view this job');
    });

    test('18. USER_B cannot retry USER_A failed document job (403 Forbidden)', async () => {
        const userA_id = 'user-alice-owner';
        const userB_id = 'user-bob-intruder';
        const userB_token = createToken({ id: userB_id, role: 'student' });
        const jobId = 'job_auth_retry_' + Date.now();

        await DocumentJob.create({
            jobId,
            userId: userA_id,
            filename: 'alice_notes.pdf',
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
        });

        const res = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${userB_token}` },
        });
        const data = await res.json();

        assert.equal(res.status, 403);
        assert.equal(data.message, 'Not authorized to retry this job');
    });

    test('19. Guest cannot access USER_A document job status without token (401 Unauthorized)', async () => {
        const jobId = 'job_auth_guest_target_' + Date.now();
        await DocumentJob.create({
            jobId,
            userId: 'user-alice-owner',
            filename: 'alice_doc.pdf',
            status: STATUS.READY,
            stage: STAGE.READY,
        });

        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'X-Guest-ID': 'guest_random' },
        });
        const data = await res.json();

        assert.equal(res.status, 401);
        assert.equal(data.message, 'Not authorized, no token');
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Identity Tampering & Spoofing Defense (Section 10 & 12)
    // ─────────────────────────────────────────────────────────────
    test('20. Server-side identity overrides client tampering: body.user_id cannot spoof identity', async () => {
        const legitimateUserId = 'user-alice-real';
        const token = createToken({ id: legitimateUserId, role: 'student' });

        let capturedPayload = null;
        let capturedHeaders = null;
        voiceController.pythonClient.post = async (url, payload, opts) => {
            capturedPayload = payload;
            capturedHeaders = opts.headers;
            return { status: 200, data: { answer: 'ok' } };
        };

        // User A sends request attempting to spoof user-bob-victim in the body
        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                question: 'Test tampering',
                user_id: 'user-bob-victim', // malicious payload
            }),
        });

        assert.equal(res.status, 200);
        // The gateway controller overrides body.user_id with the verified token ID
        assert.equal(capturedPayload.user_id, legitimateUserId);
        // Trusted internal bridge header is set to legitimate user ID
        assert.equal(capturedHeaders['X-Authenticated-User-Id'], legitimateUserId);
    });

    test('21. Guest cannot spoof X-Authenticated-User-Id: proxy generates headers strictly from verified token', () => {
        // Guest request attempting to send X-Authenticated-User-Id directly
        const spoofedReq = {
            headers: {
                'x-guest-id': 'guest_spoof_1',
                'x-authenticated-user-id': 'admin-victim',
            },
            guestId: 'guest_spoof_1',
        };

        const headers = voiceController.pythonProxyHeaders(spoofedReq);
        // Gateway generates headers from getUserId(req) which parses Authorization header only
        assert.equal(headers['X-Authenticated-User-Id'], undefined);
        assert.equal(headers['X-Guest-ID'], 'guest_spoof_1');
    });

    test('22. Authenticated user receives expected Python proxy headers', () => {
        const authReq = {
            headers: {
                authorization: 'Bearer valid-jwt-token',
            },
        };
        // Mock getUserId decode
        const token = createToken({ id: 'user-verified-42', role: 'teacher' });
        authReq.headers.authorization = `Bearer ${token}`;

        const headers = voiceController.pythonProxyHeaders(authReq);
        assert.equal(headers['X-Authenticated-User-Id'], 'user-verified-42');
        assert.equal(headers['X-Guest-ID'], 'user-user-verified-42');
        assert.equal(headers['Authorization'], `Bearer ${token}`);
    });

    // ─────────────────────────────────────────────────────────────
    // 8. Logout / Session Invalidation Simulation (Section 13)
    // ─────────────────────────────────────────────────────────────
    test('23. Stateless logout simulation: dropping token immediately prevents access to protected routes', async () => {
        const token = createToken({ id: 'user-logout-test', role: 'student' });

        // Authenticated request succeeds
        const res1 = await fetch(`${baseUrl}/api/dashboard/common`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        assert.equal(res1.status, 200);

        // Client discards token (logout action) -> subsequent request without token is rejected
        const res2 = await fetch(`${baseUrl}/api/dashboard/common`);
        const data2 = await res2.json();

        assert.equal(res2.status, 401);
        assert.equal(data2.message, 'Not authorized, no token');
    });

});
