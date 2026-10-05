/**
 * Phase 6K: Failure Modes, Resilience & Recovery Testing Suite (Node)
 * DigiLab QA & Automated Testing Track
 *
 * Validates that the Node application layer:
 * 1. Safely handles Python AI service outages, returning HTTP 500 without hanging.
 * 2. Compensates/rolls back guest quota on downstream failures so users aren't penalized.
 * 3. Immediately recovers and serves requests when Python becomes reachable again.
 * 4. Transitions DocumentJob to terminal FAILED state when Python ingestion reports errors.
 * 5. Safely aborts and transitions DocumentJob to FAILED when ingestion polling exceeds timeouts.
 * 6. Immediately fails and flags missing on-disk upload files.
 * 7. Correctly resets and re-queues failed ingestion jobs via /upload-retry/:jobId.
 * 8. Maintains upload atomicity when BullMQ queue addition fails (HTTP 500, never false 202).
 * 9. Safely reports persistence failures (HTTP 500) and recovers cleanly on subsequent requests.
 * 10. Does not allow repeated job failures to block or poison subsequent healthy jobs.
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
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const ChatSession = require('../models/ChatSession');
const { ingestionQueue, ingestionWorker, processIngestionJob } = require('../services/ingestionQueue');
const guestQuotaMiddleware = require('../middleware/guestQuotaMiddleware');

describe('Phase 6K: Failure Modes, Resilience & Recovery Testing Suite (Node)', () => {
    let app, server, baseUrl;
    let originalPythonPost, originalQueueAdd, originalSessionSave;
    let originalReserveQuota, originalCompensateQuota, originalGetGuestQuotaData;
    let tempDir, tempPdfPath;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6k';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (id = 'user-resilience-123', role = 'student') =>
        jwt.sign({ id, role }, JWT_SECRET, { expiresIn: '1h' });

    before(async () => {
        originalPythonPost = voiceController.pythonClient.post;
        originalQueueAdd = ingestionQueue.add;
        originalSessionSave = ChatSession.prototype.save;
        originalReserveQuota = guestQuotaMiddleware.reserveQuota;
        originalCompensateQuota = guestQuotaMiddleware.compensateQuota;
        originalGetGuestQuotaData = guestQuotaMiddleware.getGuestQuotaData;

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digilab-6k-node-'));
        tempPdfPath = path.join(tempDir, 'resilience_test.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from('%PDF-1.4 Resilience and Recovery test content'));

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));
        app.use('/api/voice', voiceRoutes);
        app.use('/api/chat', chatRoutes);

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
        guestQuotaMiddleware.reserveQuota = originalReserveQuota;
        guestQuotaMiddleware.compensateQuota = originalCompensateQuota;
        guestQuotaMiddleware.getGuestQuotaData = originalGetGuestQuotaData;
    });

    // ── 1: Python Service Failure ──────────────────────────────────

    test('1. Python service unreachable (ECONNREFUSED) returns HTTP 500 without hanging', async () => {
        // Must mock quota so the request reaches pythonClient.post rather
        // than short-circuiting at reserveQuota (which hits Firestore).
        guestQuotaMiddleware.reserveQuota = async (_id) => ({ messagesUsed: 1, limit: 5, sessionStarted: true });
        guestQuotaMiddleware.compensateQuota = async (_id) => {};

        voiceController.pythonClient.post = async () => {
            const err = new Error('connect ECONNREFUSED 127.0.0.1:8000');
            err.code = 'ECONNREFUSED';
            throw err;
        };

        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': 'guest_econnrefused_01' },
            body: JSON.stringify({ question: 'What is media literacy?' }),
        });

        assert.equal(res.status, 500);
        const data = await res.json();
        assert.equal(data.message, 'Chat failed');
        assert.ok(data.detail.includes('ECONNREFUSED'));
    });

    // ── 2: Guest Quota Rollback ────────────────────────────────────
    // voiceController imports { reserveQuota, compensateQuota } from
    // guestQuotaMiddleware. Module caching means replacing them on the
    // exported object here intercepts the calls inside the controller.

    test('2. Guest quota is rolled back via compensateQuota on Python connection failure', async () => {
        let compensateCalled = false;
        let reserveCallCount = 0;

        guestQuotaMiddleware.reserveQuota = async (_id) => {
            reserveCallCount++;
            return { messagesUsed: 1, limit: 5, sessionStarted: true };
        };
        guestQuotaMiddleware.compensateQuota = async (_id) => {
            compensateCalled = true;
        };

        voiceController.pythonClient.post = async () => {
            const err = new Error('AI backend timeout');
            err.response = { data: { detail: 'Model timeout' } };
            throw err;
        };

        const res = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': 'guest_quota_rollback_02' },
            body: JSON.stringify({ question: 'Trigger failure' }),
        });

        assert.equal(res.status, 500);
        assert.equal(reserveCallCount, 1, 'reserveQuota must be called once');
        assert.equal(compensateCalled, true, 'compensateQuota must roll back quota on downstream failure');
    });

    // ── 3: Recovery After Python Failure ──────────────────────────

    test('3. Node recovers immediately without restart when Python service becomes healthy', async () => {
        guestQuotaMiddleware.reserveQuota = async (_id) => ({ messagesUsed: 1, limit: 5, sessionStarted: true });
        guestQuotaMiddleware.compensateQuota = async (_id) => {};

        // Step 1: Python is down
        voiceController.pythonClient.post = async () => {
            throw new Error('connect ECONNREFUSED 127.0.0.1:8000');
        };

        const failRes = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': 'guest_recovery_03' },
            body: JSON.stringify({ question: 'First query while down' }),
        });
        assert.equal(failRes.status, 500);

        // Step 2: Python service recovers — same Node process, no restart
        voiceController.pythonClient.post = async () => ({
            data: {
                answer: 'Media literacy is the ability to critically analyze media messages.',
                sources: [{ source: 'guide.pdf', page: 1 }],
            },
        });

        const recoverRes = await fetch(`${baseUrl}/api/voice/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Guest-ID': 'guest_recovery_03' },
            body: JSON.stringify({ question: 'Second query after recovery' }),
        });

        assert.equal(recoverRes.status, 200);
        const data = await recoverRes.json();
        assert.ok(data.answer.includes('Media literacy'));
        assert.equal(data.sources.length, 1);
    });

    // ── 4-6: Ingestion Worker Failures ────────────────────────────

    test('4. Ingestion worker transitions DocumentJob to FAILED when Python returns status === "error"', async () => {
        const jobId = `job_err_${Date.now()}`;
        await DocumentJob.create({
            jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test',
            filename: 'resilience_test.pdf', filePath: tempPdfPath,
            status: STATUS.QUEUED, stage: STAGE.QUEUED,
        });

        const mockJob = { data: { jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test', filename: 'resilience_test.pdf', filePath: tempPdfPath, mimeType: 'application/pdf' }, attemptsMade: 0 };

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) return { ok: true, status: 200, json: async () => ({ status: 'error', error: 'Pinecone upsert failed: quota exceeded' }) };
            return { ok: true, status: 200, json: async () => ({}) };
        };

        await assert.rejects(processIngestionJob(mockJob, { fetch: mockFetch, pollIntervalMs: 5, timeoutMs: 1000 }), /Pinecone upsert failed/);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.FAILED);
        assert.equal(savedJob.stage, STAGE.FAILED);
        assert.equal(savedJob.errorCode, 'INGESTION_FAILED');
        assert.ok(savedJob.errorMessage.includes('Pinecone upsert failed'));
    });

    test('5. Ingestion worker times out and marks DocumentJob as FAILED if Python hangs in processing', async () => {
        const jobId = `job_timeout_${Date.now()}`;
        await DocumentJob.create({
            jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test',
            filename: 'resilience_test.pdf', filePath: tempPdfPath,
            status: STATUS.QUEUED, stage: STAGE.QUEUED,
        });

        const mockJob = { data: { jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test', filename: 'resilience_test.pdf', filePath: tempPdfPath, mimeType: 'application/pdf' }, attemptsMade: 0 };

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) return { ok: true, status: 200, json: async () => ({ status: 'processing', chunks_created: 0, vectors_upserted: 0 }) };
            return { ok: true, status: 200, json: async () => ({}) };
        };

        await assert.rejects(processIngestionJob(mockJob, { fetch: mockFetch, pollIntervalMs: 5, timeoutMs: 40 }), /timed out/);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.FAILED);
        assert.equal(savedJob.stage, STAGE.FAILED);
        assert.ok(savedJob.errorMessage.includes('timed out'));
    });

    test('6. Ingestion worker rejects missing file on disk with terminal FAILED', async () => {
        const jobId = `job_nofile_${Date.now()}`;
        const nonExistentPath = path.join(tempDir, 'does_not_exist.pdf');

        await DocumentJob.create({
            jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test',
            filename: 'does_not_exist.pdf', filePath: nonExistentPath,
            status: STATUS.QUEUED, stage: STAGE.QUEUED,
        });

        const mockJob = { data: { jobId, documentId: `doc_${jobId}`, userId: 'user-worker-test', filename: 'does_not_exist.pdf', filePath: nonExistentPath, mimeType: 'application/pdf' }, attemptsMade: 0 };

        await assert.rejects(processIngestionJob(mockJob, { timeoutMs: 1000 }), /not found on disk/);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.FAILED);
        assert.equal(savedJob.errorCode, 'INGESTION_FAILED');
        assert.ok(savedJob.errorMessage.includes('not found on disk'));
    });

    // ── 7: Ingestion Retry Re-queue ────────────────────────────────

    test('7. Ingestion retry endpoint (/upload-retry/:jobId) resets FAILED job to QUEUED', async () => {
        const userId = 'user-retry-test-07';
        const jobId = `job_retry_${Date.now()}`;
        const token = createToken(userId);

        await DocumentJob.create({
            jobId, documentId: `doc_${jobId}`, userId,
            filename: 'resilience_test.pdf', filePath: tempPdfPath,
            fileUrl: '/uploads/resilience_test.pdf', mimeType: 'application/pdf',
            status: STATUS.FAILED, stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED', errorMessage: 'Previous transient failure',
        });

        let queueAdded = false;
        ingestionQueue.add = async (name, data) => {
            queueAdded = true;
            assert.equal(name, 'ingest-document');
            assert.equal(data.jobId, jobId);
            return { id: jobId };
        };

        const res = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
        });

        assert.equal(res.status, 200);
        assert.equal(queueAdded, true, 'Job must be re-added to ingestion queue');

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.QUEUED);
        assert.equal(savedJob.stage, STAGE.QUEUED);
        assert.equal(savedJob.errorCode, null);
        assert.equal(savedJob.errorMessage, null);
    });

    // ── 8: BullMQ Outage Atomicity ─────────────────────────────────

    test('8. Queue addition failure (BullMQ outage) returns HTTP 500 without returning false 202', async () => {
        const token = createToken('user-queue-outage-08');

        ingestionQueue.add = async () => { throw new Error('Redis connection lost'); };

        const boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const body = [
            `--${boundary}`,
            'Content-Disposition: form-data; name="file"; filename="test.pdf"',
            'Content-Type: application/pdf',
            '',
            '%PDF-1.4 Dummy PDF Content',
            `--${boundary}--`,
        ].join('\r\n');

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': `multipart/form-data; boundary=${boundary}` },
            body: Buffer.from(body),
        });

        assert.equal(res.status, 500);
        assert.notEqual(res.status, 202, 'Must never return 202 when queue addition fails');
        const data = await res.json();
        assert.ok(data.message.includes('Failed to queue document'));
    });

    // ── 9: ChatSession Persistence Failure & Recovery ──────────────

    test('9. ChatSession persistence failure returns HTTP 500 and recovers on next save', async () => {
        const token = createToken('user-persistence-09');

        // Step 1: Simulate DB failure
        ChatSession.prototype.save = async () => { throw new Error('Firestore connection timeout'); };

        const failRes = await fetch(`${baseUrl}/api/chat/sessions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: 'session_pers_09', messages: [{ role: 'user', content: 'Hello' }] }),
        });

        assert.equal(failRes.status, 500);
        const failData = await failRes.json();
        assert.ok(failData.message.includes('Firestore connection timeout'));

        // Step 2: DB recovers
        ChatSession.prototype.save = async function() { return this; };

        const recoverRes = await fetch(`${baseUrl}/api/chat/sessions`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId: 'session_pers_09', messages: [{ role: 'user', content: 'Hello' }] }),
        });

        assert.equal(recoverRes.status, 200);
        const recoverData = await recoverRes.json();
        assert.equal(recoverData.userId, 'user-persistence-09');
    });

    // ── 10: Repeated Failures Don't Block Queue ─────────────────────

    test('10. Repeated downstream failures do not lock up subsequent successful jobs', async () => {
        const failJob1 = { data: { jobId: `job_rep_fail_1_${Date.now()}`, filename: 'fail1.pdf', filePath: tempPdfPath, mimeType: 'application/pdf' }, attemptsMade: 0 };
        await DocumentJob.create({ jobId: failJob1.data.jobId, filename: 'fail1.pdf', status: STATUS.QUEUED });

        await assert.rejects(
            processIngestionJob(failJob1, { fetch: async () => ({ ok: false, status: 502, text: async () => 'Bad Gateway' }), timeoutMs: 100 }),
            /Bad Gateway/
        );

        // Success job must run normally after the failure
        const successJob = { data: { jobId: `job_rep_succ_${Date.now()}`, filename: 'succ.pdf', filePath: tempPdfPath, mimeType: 'application/pdf' }, attemptsMade: 0 };
        await DocumentJob.create({ jobId: successJob.data.jobId, filename: 'succ.pdf', status: STATUS.QUEUED });

        const mockFetchSuccess = async (url) => {
            if (url.includes('/upload-pdf/status')) return { ok: true, status: 200, json: async () => ({ status: 'done', chunks_created: 8, vectors_upserted: 8 }) };
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const result = await processIngestionJob(successJob, { fetch: mockFetchSuccess, pollIntervalMs: 5, timeoutMs: 1000 });

        assert.equal(result.success, true);
        assert.equal(result.chunks, 8);

        const savedJob = await DocumentJob.getById(successJob.data.jobId);
        assert.equal(savedJob.status, STATUS.READY);
        assert.equal(savedJob.stage, STAGE.READY);
    });
});
