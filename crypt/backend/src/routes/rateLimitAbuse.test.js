/**
 * Phase 6F: Rate Limiting & Abuse Testing Test Suite (Node / Express)
 * DigiLab QA & Automated Testing Track
 *
 * Verifies:
 * 1. Guest quota boundary calculation (1..5 allowed, 6th throws limit_exceeded).
 * 2. Route-level HTTP 429 enforcement on /api/voice/chat for exhausted guest quota.
 * 3. HTTP 429 response schema contract ({ message, detail: 'guest_quota_exceeded' }).
 * 4. Guest identity isolation (GUEST_A exhaustion does NOT impact GUEST_B).
 * 5. Authenticated user isolation (exhausted guest does NOT block authenticated user).
 * 6. Quota compensation rollback on downstream failure (compensateQuota).
 * 7. Missing identity header rejection (unauthenticated request without X-Guest-ID -> 400).
 * 8. Python proxy header spoofing prevention (untrusted client cannot forge X-Authenticated-User-Id).
 * 9. Deep Research quota boundary (limit: 3 runs in 30 days, 4th -> 429).
 * 10. Deep Research user isolation (USER_A exhaustion does NOT affect USER_B).
 * 11. Deep Research unauthenticated access rejection (missing user context -> 401).
 * 12. Normal legitimate traffic preservation below limits.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');

// Mock Firestore store for deterministic in-memory quota tracking
const mockFirestoreStore = new Map();
const mockDb = {
    collection: (colName) => ({
        doc: (docId) => ({
            id: docId,
            get: async () => {
                const data = mockFirestoreStore.get(docId);
                return {
                    exists: !!data,
                    data: () => data || null
                };
            }
        })
    }),
    runTransaction: async (updateFunction) => {
        const transaction = {
            get: async (docRef) => {
                const data = mockFirestoreStore.get(docRef.id);
                return {
                    exists: !!data,
                    data: () => data || null
                };
            },
            set: (docRef, data, options) => {
                const existing = mockFirestoreStore.get(docRef.id) || {};
                mockFirestoreStore.set(docRef.id, options?.merge ? { ...existing, ...data } : data);
            }
        };
        return await updateFunction(transaction);
    }
};

const origFirestoreDescriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(admin), 'firestore');
if (admin.apps.length === 0) {
    admin.initializeApp({ projectId: 'test-phase6f' });
}
Object.defineProperty(Object.getPrototypeOf(admin), 'firestore', {
    value: () => mockDb,
    configurable: true
});

const dbConfig = require('../config/db');
dbConfig.initializeFirebase();

const {
    classifyUser,
    reserveQuota,
    compensateQuota,
    getGuestQuotaData
} = require('../middleware/guestQuotaMiddleware');
const { checkResearchQuota } = require('../middleware/quotaMiddleware');
const DeepResearchUsage = require('../models/DeepResearchUsage');
const voiceController = require('../controllers/voiceController');
const voiceRoutes = require('./voiceRoutes');

describe('Phase 6F: Rate Limiting & Abuse Testing Suite (Node)', () => {
    let app;
    let server;
    let baseUrl;
    let originalGetFirestore;
    let originalPythonPost;
    let originalFindActiveInWindow;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6f';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (payload, options = { expiresIn: '1h' }) => {
        return jwt.sign(payload, JWT_SECRET, options);
    };

    before(async () => {
        originalPythonPost = voiceController.pythonClient.post;
        originalFindActiveInWindow = DeepResearchUsage.findActiveInWindow;

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        // Mount voice routes
        app.use('/api/voice', voiceRoutes);

        // Mount a test endpoint protected by checkResearchQuota
        app.post('/api/test-research-quota', (req, res, next) => {
            if (req.headers['x-test-user-id']) {
                req.user = { id: req.headers['x-test-user-id'] };
            }
            next();
        }, checkResearchQuota, (req, res) => {
            res.json({ success: true, quota: req.quota });
        });

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
        DeepResearchUsage.findActiveInWindow = originalFindActiveInWindow;

        if (origFirestoreDescriptor) {
            Object.defineProperty(Object.getPrototypeOf(admin), 'firestore', origFirestoreDescriptor);
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
    });

    beforeEach(() => {
        mockFirestoreStore.clear();
        // Default pythonClient.post mock returns valid response
        voiceController.pythonClient.post = async () => ({
            data: {
                answer: 'Mocked answer for rate limit test',
                sources: [],
            }
        });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. Guest Quota Boundary Calculation (Unit)
    // ─────────────────────────────────────────────────────────────
    test('1. Guest quota reserveQuota enforces strict 5-request limit boundary', async () => {
        const guestId = 'guest_boundary_test_01';

        // Requests 1..5 succeed
        for (let i = 1; i <= 5; i++) {
            const quota = await reserveQuota(guestId);
            assert.equal(quota.messagesUsed, i);
            assert.equal(quota.limit, 5);
        }

        // 6th request throws limit_exceeded
        await assert.rejects(
            async () => await reserveQuota(guestId),
            (err) => {
                assert.equal(err.message, 'limit_exceeded');
                return true;
            }
        );
    });

    // ─────────────────────────────────────────────────────────────
    // 2. HTTP 429 Route-Level Enforcement on /api/voice/chat
    // ─────────────────────────────────────────────────────────────
    test('2. Exhausted guest receives HTTP 429 and expected contract on /api/voice/chat', async () => {
        const guestId = 'guest_http_boundary_02';

        // Send 5 successful requests
        for (let i = 0; i < 5; i++) {
            const res = await fetch(`${baseUrl}/api/voice/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Guest-ID': guestId,
                },
                body: JSON.stringify({ question: `Question ${i + 1}` }),
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.guestQuota.messagesUsed, i + 1);
        }

        // 6th request must be rejected with 429
        const resOverLimit = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Guest-ID': guestId,
            },
            body: JSON.stringify({ question: 'Over limit question' }),
        });

        assert.equal(resOverLimit.status, 429);
        const errData = await resOverLimit.json();
        assert.equal(errData.message, 'Guest message limit exceeded. Please log in.');
        assert.equal(errData.detail, 'guest_quota_exceeded');
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Guest Identity Isolation (GUEST_A vs GUEST_B)
    // ─────────────────────────────────────────────────────────────
    test('3. GUEST_A limit exhaustion does NOT block GUEST_B', async () => {
        const guestA = 'guest_alpha_03';
        const guestB = 'guest_beta_03';

        // GUEST_A consumes all 5 messages
        for (let i = 0; i < 5; i++) {
            await fetch(`${baseUrl}/api/voice/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-Guest-ID': guestA },
                body: JSON.stringify({ question: `Question ${i}` }),
            });
        }

        // GUEST_A is blocked
        const resA = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': guestA },
            body: JSON.stringify({ question: 'Blocked query' }),
        });
        assert.equal(resA.status, 429);

        // GUEST_B can make requests unimpeded starting at 1
        const resB = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': guestB },
            body: JSON.stringify({ question: 'Hello from Guest B' }),
        });
        assert.equal(resB.status, 200);
        const dataB = await resB.json();
        assert.equal(dataB.guestQuota.messagesUsed, 1);
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Authenticated User Isolation from Guest Limit
    // ─────────────────────────────────────────────────────────────
    test('4. Authenticated user is NOT blocked when a guest on the same machine is exhausted', async () => {
        const guestId = 'guest_exhausted_04';

        // Exhaust guest quota
        for (let i = 0; i < 5; i++) {
            await reserveQuota(guestId);
        }

        // Authenticated user makes a chat request
        const token = createToken({ id: 'user_auth_04', email: 'auth@ignou.ac.in', role: 'student' });
        const resAuth = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
                'X-Guest-ID': guestId, // Even if client sends stale guest header, auth token takes precedence
            },
            body: JSON.stringify({ question: 'Authenticated query' }),
        });

        assert.equal(resAuth.status, 200);
        const data = await resAuth.json();
        assert.equal(data.guestQuota, null, 'Authenticated users do not have guestQuota attached');
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Quota Compensation Rollback on Upstream Failure
    // ─────────────────────────────────────────────────────────────
    test('5. Downstream failure rolls back guest quota via compensateQuota', async () => {
        const guestId = 'guest_fail_rollback_05';

        // Configure pythonClient.post to fail
        voiceController.pythonClient.post = async () => {
            const error = new Error('AI backend timeout');
            error.response = { data: { detail: 'Model timeout' } };
            throw error;
        };

        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Guest-ID': guestId,
            },
            body: JSON.stringify({ question: 'Failing query' }),
        });

        assert.equal(res.status, 500);

        // Quota must be rolled back: messagesUsed should be 0
        const quotaData = await getGuestQuotaData(guestId);
        assert.equal(quotaData.messagesUsed, 0, 'Quota must be compensated after downstream failure');
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Missing Guest Identity Header Rejection
    // ─────────────────────────────────────────────────────────────
    test('6. Unauthenticated request without X-Guest-ID is rejected with HTTP 400', async () => {
        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question: 'Anonymous without guest ID' }),
        });

        assert.equal(res.status, 400);
        const err = await res.json();
        assert.equal(err.message, 'X-Guest-ID header is required for guest requests');
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Identity Spoofing Protection in Proxy Headers
    // ─────────────────────────────────────────────────────────────
    test('7. Untrusted client cannot forge X-Authenticated-User-Id to bypass rate limiting', async () => {
        let capturedHeaders = null;
        voiceController.pythonClient.post = async (url, body, config) => {
            capturedHeaders = config.headers;
            return { data: { answer: 'ok', sources: [] } };
        };

        // Attacker attempts to pass X-Authenticated-User-Id directly as guest
        await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Guest-ID': 'guest_attacker_07',
                'X-Authenticated-User-Id': 'victim_user', // Forged header
            },
            body: JSON.stringify({ question: 'Spoof attempt' }),
        });

        assert.ok(capturedHeaders, 'Headers must be captured');
        // Node's pythonProxyHeaders MUST NOT trust client-supplied X-Authenticated-User-Id!
        assert.equal(
            capturedHeaders['X-Authenticated-User-Id'],
            undefined,
            'Untrusted client cannot forge X-Authenticated-User-Id'
        );
        assert.equal(capturedHeaders['X-Guest-ID'], 'guest_attacker_07');
    });

    // ─────────────────────────────────────────────────────────────
    // 8. Deep Research Quota Boundary
    // ─────────────────────────────────────────────────────────────
    test('8. Deep research quota rejects 4th request in 30-day window with HTTP 429', async () => {
        // User with 2 active logs -> passes (under limit 3)
        DeepResearchUsage.findActiveInWindow = async () => [
            { requestedAt: new Date(Date.now() - 10000) },
            { requestedAt: new Date(Date.now() - 5000) },
        ];

        const resAllowed = await fetch(`${baseUrl}/api/test-research-quota`, {
            method: 'POST',
            headers: { 'x-test-user-id': 'user_research_08' },
        });
        assert.equal(resAllowed.status, 200);
        const allowedData = await resAllowed.json();
        assert.equal(allowedData.quota.allowed, true);
        assert.equal(allowedData.quota.used, 2);
        assert.equal(allowedData.quota.remaining, 1);

        // User with 3 active logs -> rejected with 429
        const oldestDate = new Date(Date.now() - 15 * 86400000);
        DeepResearchUsage.findActiveInWindow = async () => [
            { requestedAt: oldestDate },
            { requestedAt: new Date(Date.now() - 10000) },
            { requestedAt: new Date(Date.now() - 5000) },
        ];

        const resBlocked = await fetch(`${baseUrl}/api/test-research-quota`, {
            method: 'POST',
            headers: { 'x-test-user-id': 'user_research_08' },
        });
        assert.equal(resBlocked.status, 429);
        const blockedData = await resBlocked.json();
        assert.equal(blockedData.allowed, false);
        assert.equal(blockedData.used, 3);
        assert.equal(blockedData.remaining, 0);
        assert.ok(blockedData.message.includes('Monthly Deep Research limit reached'));
        assert.ok(blockedData.renewAt);
    });

    // ─────────────────────────────────────────────────────────────
    // 9. Deep Research User Isolation
    // ─────────────────────────────────────────────────────────────
    test('9. USER_A Deep Research exhaustion does NOT block USER_B', async () => {
        DeepResearchUsage.findActiveInWindow = async (userId) => {
            if (userId === 'user_exhausted_09') {
                return [
                    { requestedAt: new Date() },
                    { requestedAt: new Date() },
                    { requestedAt: new Date() },
                ];
            }
            return []; // USER_B has 0 active logs
        };

        const resA = await fetch(`${baseUrl}/api/test-research-quota`, {
            method: 'POST',
            headers: { 'x-test-user-id': 'user_exhausted_09' },
        });
        assert.equal(resA.status, 429);

        const resB = await fetch(`${baseUrl}/api/test-research-quota`, {
            method: 'POST',
            headers: { 'x-test-user-id': 'user_fresh_09' },
        });
        assert.equal(resB.status, 200);
        const dataB = await resB.json();
        assert.equal(dataB.quota.remaining, 3);
    });

    // ─────────────────────────────────────────────────────────────
    // 10. Deep Research Unauthenticated Context Rejection
    // ─────────────────────────────────────────────────────────────
    test('10. Request without user context is rejected by checkResearchQuota with HTTP 401', async () => {
        const res = await fetch(`${baseUrl}/api/test-research-quota`, {
            method: 'POST',
            // No x-test-user-id header provided
        });
        assert.equal(res.status, 401);
        const err = await res.json();
        assert.equal(err.message, 'Not authorized, user context missing');
    });

    // ─────────────────────────────────────────────────────────────
    // 11. Normal Legitimate Traffic Preservation
    // ─────────────────────────────────────────────────────────────
    test('11. Legitimate user requests below limits proceed smoothly without false 429s', async () => {
        const guestId = 'guest_legitimate_11';

        for (let i = 1; i <= 3; i++) {
            const res = await fetch(`${baseUrl}/api/voice/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Guest-ID': guestId,
                },
                body: JSON.stringify({ question: `Legitimate message ${i}` }),
            });
            assert.equal(res.status, 200);
            const data = await res.json();
            assert.equal(data.guestQuota.messagesUsed, i);
        }
    });
});
