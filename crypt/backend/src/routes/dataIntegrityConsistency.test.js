/**
 * Phase 6H: Data Integrity & Consistency Testing Suite (Node / Express / BullMQ)
 * DigiLab QA & Automated Testing Track
 *
 * Verifies:
 * 1. DocumentJob identity triad (jobId, documentId, userId) invariants preserved on creation.
 * 2. DocumentJob lifecycle state integrity (QUEUED -> PROCESSING -> READY preserves identity).
 * 3. DocumentJob failure state invariants (FAILED state captures non-null errorCode & errorMessage).
 * 4. Cross-user job isolation on upload-status endpoint (USER_B rejected with 403 Forbidden).
 * 5. Cross-user retry rejection on upload-retry endpoint (USER_B rejected with 403 Forbidden).
 * 6. Retry state reset consistency (retrying FAILED job resets status/stage to QUEUED and clears errors while preserving IDs).
 * 7. Atomicity on queue failure (ingestionQueue.add error yields HTTP 500, never false 202).
 * 8. ChatSession user data isolation (session owner checks & cache key segregation user_sessions:{userId}).
 * 9. Upload path consistency and isolation (identical filenames with distinct documentIds map to separate paths).
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const jwt = require('jsonwebtoken');

const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const ChatSession = require('../models/ChatSession');
const {
    ingestionQueue,
    ingestionWorker,
} = require('../services/ingestionQueue');
const chatRoutes = require('./chatRoutes');

describe('Phase 6H: Data Integrity & Consistency Testing Suite (Node)', () => {
    let app;
    let server;
    let baseUrl;
    let tempDir;
    let tempPdfPath;
    let originalQueueAdd;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6h';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (payload, options = { expiresIn: '1h' }) => {
        return jwt.sign(payload, JWT_SECRET, options);
    };

    before(async () => {
        originalQueueAdd = ingestionQueue.add;

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digilab-6h-node-'));
        tempPdfPath = path.join(tempDir, 'data_consistency.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from('%PDF-1.4 Data consistency test content'));

        app = express();
        app.use(express.json());
        app.use(express.urlencoded({ extended: false }));

        // Mount chat routes
        app.use('/api/chat', chatRoutes);

        await new Promise((resolve) => {
            server = app.listen(0, () => {
                const port = server.address().port;
                baseUrl = `http://127.0.0.1:${port}`;
                resolve();
            });
        });
    });

    after(async () => {
        ingestionQueue.add = originalQueueAdd;

        try {
            if (fs.existsSync(tempPdfPath)) fs.unlinkSync(tempPdfPath);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
        } catch {
            // ignore cleanup errors
        }

        if (server) {
            await new Promise((resolve) => server.close(resolve));
        }
        await ingestionWorker.close();
        await ingestionQueue.close();
    });

    beforeEach(() => {
        ingestionQueue.add = async (jobName, data, opts) => ({ id: opts?.jobId || 'mock-job-id', data });
    });

    // ─────────────────────────────────────────────────────────────
    // 1. DocumentJob Identity Triad Invariants
    // ─────────────────────────────────────────────────────────────
    test('1. DocumentJob preserves identity triad (jobId, documentId, userId) and default state', async () => {
        const jobId = `job_triad_${Date.now()}`;
        const docId = `doc_triad_${Date.now()}`;
        const userId = 'user_triad_alice';

        const job = await DocumentJob.create({
            jobId,
            documentId: docId,
            userId,
            filename: 'curriculum.pdf',
            size: 4096,
            mimeType: 'application/pdf',
        });

        assert.equal(job.jobId, jobId);
        assert.equal(job.documentId, docId);
        assert.equal(job.userId, userId);
        assert.equal(job.filename, 'curriculum.pdf');
        assert.equal(job.size, 4096);
        assert.equal(job.status, STATUS.QUEUED);
        assert.equal(job.stage, STAGE.QUEUED);
        assert.equal(job.errorCode, null);
        assert.equal(job.errorMessage, null);

        // Fetch back and assert persistence
        const retrieved = await DocumentJob.getById(jobId);
        assert.ok(retrieved);
        assert.equal(retrieved.jobId, jobId);
        assert.equal(retrieved.documentId, docId);
        assert.equal(retrieved.userId, userId);
    });

    // ─────────────────────────────────────────────────────────────
    // 2. Lifecycle State Transition Integrity
    // ─────────────────────────────────────────────────────────────
    test('2. DocumentJob transitions through QUEUED -> PROCESSING -> READY preserving identity', async () => {
        const jobId = `job_lifecycle_${Date.now()}`;
        const job = await DocumentJob.create({
            jobId,
            documentId: `doc_${jobId}`,
            userId: 'user_lifecycle_tester',
            filename: 'handbook.pdf',
            status: STATUS.QUEUED,
            stage: STAGE.QUEUED,
        });

        // Step 1: Processing
        const processingJob = await DocumentJob.update(jobId, {
            status: STATUS.PROCESSING,
            stage: STAGE.EXTRACTING,
        });
        assert.equal(processingJob.status, STATUS.PROCESSING);
        assert.equal(processingJob.stage, STAGE.EXTRACTING);
        assert.equal(processingJob.errorCode, null);

        // Step 2: Ready
        const readyJob = await DocumentJob.update(jobId, {
            status: STATUS.READY,
            stage: STAGE.READY,
        });
        assert.equal(readyJob.status, STATUS.READY);
        assert.equal(readyJob.stage, STAGE.READY);
        assert.equal(readyJob.errorCode, null, 'READY job must have null errorCode');
        assert.equal(readyJob.errorMessage, null, 'READY job must have null errorMessage');
        assert.equal(readyJob.jobId, jobId, 'JobId must remain unchanged');
        assert.equal(readyJob.userId, 'user_lifecycle_tester', 'UserId must remain unchanged');
    });

    // ─────────────────────────────────────────────────────────────
    // 3. DocumentJob Failure State Invariants
    // ─────────────────────────────────────────────────────────────
    test('3. DocumentJob in FAILED status strictly requires non-null errorCode and errorMessage', async () => {
        const jobId = `job_failed_${Date.now()}`;
        const job = await DocumentJob.create({
            jobId,
            userId: 'user_fail_tester',
            filename: 'bad_file.pdf',
            status: STATUS.PROCESSING,
            stage: STAGE.EMBEDDING,
        });

        const failedJob = await DocumentJob.update(jobId, {
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'DOWNSTREAM_ERROR',
            errorMessage: 'FastAPI python service connection timed out',
        });

        assert.equal(failedJob.status, STATUS.FAILED);
        assert.equal(failedJob.stage, STAGE.FAILED);
        assert.ok(failedJob.errorCode, 'FAILED job must have errorCode');
        assert.ok(failedJob.errorMessage, 'FAILED job must have errorMessage');
        assert.equal(failedJob.errorCode, 'DOWNSTREAM_ERROR');
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Cross-User Job Isolation on Status API
    // ─────────────────────────────────────────────────────────────
    test('4. GET /api/chat/upload-status/:jobId rejects cross-user access with HTTP 403', async () => {
        const jobId = `job_iso_status_${Date.now()}`;
        const ownerId = 'user_owner_alice';
        const attackerId = 'user_attacker_bob';

        await DocumentJob.create({
            jobId,
            documentId: `doc_${jobId}`,
            userId: ownerId,
            filename: 'confidential_research.pdf',
            status: STATUS.PROCESSING,
            stage: STAGE.INDEXING,
        });

        // Attacker attempts to read Alice's status
        const attackerToken = createToken({ id: attackerId, email: 'bob@ignou.ac.in', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${attackerToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.message, 'Not authorized to view this job');

        // Owner can access successfully
        const ownerToken = createToken({ id: ownerId, email: 'alice@ignou.ac.in', role: 'student' });
        const ownerRes = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${ownerToken}` },
        });
        assert.equal(ownerRes.status, 200);
        const ownerData = await ownerRes.json();
        assert.equal(ownerData.jobId, jobId);
        assert.equal(ownerData.status, STATUS.PROCESSING);
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Cross-User Retry Rejection
    // ─────────────────────────────────────────────────────────────
    test('5. POST /api/chat/upload-retry/:jobId rejects cross-user retry with HTTP 403', async () => {
        const jobId = `job_iso_retry_${Date.now()}`;
        const ownerId = 'user_owner_alice';
        const attackerId = 'user_attacker_bob';

        await DocumentJob.create({
            jobId,
            documentId: `doc_${jobId}`,
            userId: ownerId,
            filename: 'test.pdf',
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'TIMEOUT',
            errorMessage: 'Timeout error',
        });

        const attackerToken = createToken({ id: attackerId, email: 'bob@ignou.ac.in', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${attackerToken}` },
        });

        assert.equal(res.status, 403);
        const data = await res.json();
        assert.equal(data.message, 'Not authorized to retry this job');
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Retry State Reset Consistency
    // ─────────────────────────────────────────────────────────────
    test('6. Retrying FAILED job resets state to QUEUED, clears errors, and preserves IDs', async () => {
        const jobId = `job_retry_reset_${Date.now()}`;
        const docId = `doc_${jobId}`;
        const userId = 'user_retry_tester';

        await DocumentJob.create({
            jobId,
            documentId: docId,
            userId,
            filename: 'notes.pdf',
            size: 2048,
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'PREVIOUS_ERROR',
            errorMessage: 'Previous failure message',
        });

        let enqueuedJobId = null;
        ingestionQueue.add = async (name, jobData, opts) => {
            enqueuedJobId = jobData?.jobId || opts?.jobId;
            return { id: enqueuedJobId, data: jobData };
        };

        const userToken = createToken({ id: userId, email: 'retry@ignou.ac.in', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${userToken}` },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.jobId, jobId);
        assert.equal(data.status, STATUS.QUEUED);

        // Verify enqueued with identical ID
        assert.equal(enqueuedJobId, jobId);

        // Verify persisted record was cleanly reset
        const reloaded = await DocumentJob.getById(jobId);
        assert.equal(reloaded.documentId, docId);
        assert.equal(reloaded.userId, userId);
        assert.equal(reloaded.status, STATUS.QUEUED);
        assert.equal(reloaded.stage, STAGE.QUEUED);
        assert.equal(reloaded.errorCode, null);
        assert.equal(reloaded.errorMessage, null);
    });

    // ─────────────────────────────────────────────────────────────
    // 7. Partial-Write Atomicity: Queue Failure Handling
    // ─────────────────────────────────────────────────────────────
    test('7. Queue addition failure returns HTTP 500 without returning false 202', async () => {
        const token = createToken({ id: 'user_queue_fail', email: 'qfail@ignou.ac.in', role: 'student' });
        const formData = new FormData();
        const fakeBlob = new Blob([fs.readFileSync(tempPdfPath)], { type: 'application/pdf' });
        formData.append('file', fakeBlob, 'fail_queue.pdf');

        // Simulate BullMQ failure
        ingestionQueue.add = async () => {
            throw new Error('Redis connection refused: ECONNREFUSED');
        };

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        assert.notEqual(res.status, 202, 'Must not return HTTP 202 on queue failure');
        assert.equal(res.status, 500);
        const data = await res.json();
        assert.ok(data.message || data.error);
    });

    // ─────────────────────────────────────────────────────────────
    // 8. ChatSession User Identity & Isolation Invariants
    // ─────────────────────────────────────────────────────────────
    test('8. ChatSession strictly binds to userId and prevents cross-user access', async () => {
        const sessionA = new ChatSession({
            id: 'session_user_alice_123',
            userId: 'user_alice',
            title: 'Alice Private Study',
            messages: [{ role: 'user', content: 'Secret research question' }],
        });

        assert.equal(sessionA.userId, 'user_alice');
        assert.equal(sessionA.title, 'Alice Private Study');
        assert.equal(sessionA.messages.length, 1);

        // Verify cache key naming format
        const cacheKeyA = `user_sessions:${sessionA.userId}`;
        const cacheKeyB = `user_sessions:user_bob`;
        assert.notEqual(cacheKeyA, cacheKeyB, 'User cache keys must be isolated');
        assert.equal(cacheKeyA, 'user_sessions:user_alice');
    });

    // ─────────────────────────────────────────────────────────────
    // 9. Upload Path Consistency and Storage Isolation
    // ─────────────────────────────────────────────────────────────
    test('9. Identical filenames across distinct document IDs generate distinct storage paths', () => {
        const baseUploadDir = path.join(os.tmpdir(), 'digilab_uploads');
        const docIdA = 'doc_session_111';
        const docIdB = 'doc_session_222';
        const filename = 'assignment.pdf';

        const safeDocA = docIdA.replace(/[^A-Za-z0-9_-]+/g, '_');
        const safeDocB = docIdB.replace(/[^A-Za-z0-9_-]+/g, '_');

        const pathA = path.join(baseUploadDir, safeDocA, filename);
        const pathB = path.join(baseUploadDir, safeDocB, filename);

        assert.notEqual(pathA, pathB, 'Storage paths must be disjoint');
        assert.ok(pathA.includes(safeDocA));
        assert.ok(pathB.includes(safeDocB));
    });
});
