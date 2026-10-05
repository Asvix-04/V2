/**
 * Phase 6G: Document & Ingestion Testing Suite (Node / Express)
 * DigiLab QA & Automated Testing Track
 *
 * Verifies:
 * 1. Upload route validation (missing file -> 400, non-document -> 200, valid document -> 202).
 * 2. DocumentJob creation and BullMQ enqueue behavior on document upload.
 * 3. Identity propagation (jobId, documentId, userId, filename) through upload, job, and queue.
 * 4. User and job isolation on upload-status endpoint (USER_A allowed, USER_B rejected with 403).
 * 5. Worker processing lifecycle (QUEUED -> PROCESSING -> EXTRACTING -> EMBEDDING -> INDEXING -> READY).
 * 6. Worker failure propagation and terminal FAILED state recording downstream error.
 * 7. Job retry endpoint (upload-retry resets state to QUEUED, clears errors, re-enqueues).
 * 8. User authorization on job retry (USER_B rejected with 403 when attempting to retry USER_A's job).
 * 9. Missing file on disk failure handling in worker.
 * 10. Status API consistency between GET /api/chat/upload-status/:jobId and DocumentJob model.
 */

const { test, describe, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const express = require('express');
const jwt = require('jsonwebtoken');

const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');
const {
    ingestionQueue,
    ingestionWorker,
    processIngestionJob,
} = require('../services/ingestionQueue');
const chatRoutes = require('./chatRoutes');

describe('Phase 6G: Document & Ingestion Testing Suite (Node)', () => {
    let app;
    let server;
    let baseUrl;
    let tempDir;
    let tempPdfPath;
    let tempTxtPath;
    let originalQueueAdd;

    const JWT_SECRET = process.env.JWT_SECRET || 'test_jwt_secret_6g';
    process.env.JWT_SECRET = JWT_SECRET;

    const createToken = (payload, options = { expiresIn: '1h' }) => {
        return jwt.sign(payload, JWT_SECRET, options);
    };

    before(async () => {
        originalQueueAdd = ingestionQueue.add;

        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digilab-6g-node-'));
        tempPdfPath = path.join(tempDir, 'syllabus_curriculum.pdf');
        fs.writeFileSync(tempPdfPath, Buffer.from('%PDF-1.4 Mock curriculum syllabus document'));

        tempTxtPath = path.join(tempDir, 'notes.txt');
        fs.writeFileSync(tempTxtPath, Buffer.from('Plain text notes'));

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
            if (fs.existsSync(tempTxtPath)) fs.unlinkSync(tempTxtPath);
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
    // 1. Upload Route Validation
    // ─────────────────────────────────────────────────────────────
    test('1. Upload without file returns HTTP 400', async () => {
        const token = createToken({ id: 'user_val_01', email: 'val@ignou.ac.in', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });

        assert.equal(res.status, 400);
        const data = await res.json();
        assert.equal(data.message, 'No file uploaded');
    });

    test('2. Uploading non-document file (.png) returns HTTP 200 without queueing', async () => {
        const token = createToken({ id: 'user_val_02', email: 'val2@ignou.ac.in', role: 'student' });
        const formData = new FormData();
        const fakeBlob = new Blob([Buffer.from('fake image data')], { type: 'image/png' });
        formData.append('file', fakeBlob, 'diagram.png');

        let queueCalled = false;
        ingestionQueue.add = async () => {
            queueCalled = true;
            return { id: 'should-not-be-called' };
        };

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.message, 'File uploaded successfully');
        assert.equal(data.originalName, 'diagram.png');
        assert.equal(queueCalled, false, 'Non-document upload must not enqueue ingestion job');
    });

    test('3. Uploading valid document (.pdf) creates DocumentJob, enqueues to BullMQ, returns HTTP 202', async () => {
        const token = createToken({ id: 'user_alice_03', email: 'alice@ignou.ac.in', role: 'student' });
        const formData = new FormData();
        const pdfBlob = new Blob([fs.readFileSync(tempPdfPath)], { type: 'application/pdf' });
        formData.append('file', pdfBlob, 'syllabus_curriculum.pdf');

        let capturedQueueData = null;
        ingestionQueue.add = async (jobName, data) => {
            capturedQueueData = data;
            return { id: data.jobId };
        };

        const res = await fetch(`${baseUrl}/api/chat/upload`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData,
        });

        assert.equal(res.status, 202);
        const data = await res.json();
        assert.equal(data.message, 'Document uploaded and queued for processing');
        assert.equal(data.status, STATUS.QUEUED);
        assert.ok(data.jobId, 'jobId must be returned');
        assert.ok(data.documentId, 'documentId must be returned');

        // Verify DocumentJob in persistence
        const job = await DocumentJob.getById(data.jobId);
        assert.ok(job, 'DocumentJob must be persisted in storage');
        assert.equal(job.status, STATUS.QUEUED);
        assert.equal(job.stage, STAGE.QUEUED);
        assert.equal(job.userId, 'user_alice_03');

        // Verify BullMQ job payload
        assert.ok(capturedQueueData);
        assert.equal(capturedQueueData.jobId, data.jobId);
        assert.equal(capturedQueueData.documentId, data.documentId);
        assert.equal(capturedQueueData.userId, 'user_alice_03');
    });

    // ─────────────────────────────────────────────────────────────
    // 2. User & Job Isolation on Status API
    // ─────────────────────────────────────────────────────────────
    test('4. USER_A can view own job status; USER_B is rejected with HTTP 403', async () => {
        const jobId = `job_iso_test_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId: `doc_iso_${Date.now()}`,
            userId: 'user_alice_owner',
            filename: 'lecture.pdf',
            status: STATUS.QUEUED,
            stage: STAGE.QUEUED,
        });

        const tokenAlice = createToken({ id: 'user_alice_owner', email: 'alice@ignou.ac.in', role: 'student' });
        const tokenBob = createToken({ id: 'user_bob_intruder', email: 'bob@ignou.ac.in', role: 'student' });

        // Alice views own job -> 200 OK
        const resAlice = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${tokenAlice}` },
        });
        assert.equal(resAlice.status, 200);
        const dataAlice = await resAlice.json();
        assert.equal(dataAlice.jobId, jobId);
        assert.equal(dataAlice.userId, 'user_alice_owner');

        // Bob attempts to view Alice's job -> 403 Forbidden
        const resBob = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${tokenBob}` },
        });
        assert.equal(resBob.status, 403);
        const dataBob = await resBob.json();
        assert.equal(dataBob.message, 'Not authorized to view this job');

        // Non-existent jobId -> 404 Not Found
        const resNonExistent = await fetch(`${baseUrl}/api/chat/upload-status/job_does_not_exist_404`, {
            headers: { 'Authorization': `Bearer ${tokenAlice}` },
        });
        assert.equal(resNonExistent.status, 404);
    });

    // ─────────────────────────────────────────────────────────────
    // 3. Worker Ingestion Lifecycle Execution (Success & Failure)
    // ─────────────────────────────────────────────────────────────
    test('5. Worker successfully transitions DocumentJob through all stages to READY', async () => {
        const jobId = `job_worker_happy_${Date.now()}`;
        const documentId = `doc_worker_happy_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId,
            userId: 'user_worker_05',
            filename: 'curriculum.pdf',
            status: STATUS.QUEUED,
            stage: STAGE.QUEUED,
        });

        const mockJob = {
            id: `bull-${jobId}`,
            attemptsMade: 0,
            data: {
                jobId,
                documentId,
                userId: 'user_worker_05',
                filename: 'curriculum.pdf',
                filePath: tempPdfPath,
                mimeType: 'application/pdf',
            },
        };

        let pollStep = 0;
        const mockFetch = async (url, opts) => {
            if (url.includes('/upload-pdf/status')) {
                pollStep++;
                if (pollStep === 1) {
                    return { ok: true, json: async () => ({ status: 'processing', chunks_created: 5, vectors_upserted: 0 }) };
                }
                if (pollStep === 2) {
                    return { ok: true, json: async () => ({ status: 'processing', chunks_created: 5, vectors_upserted: 5 }) };
                }
                return { ok: true, json: async () => ({ status: 'done', chunks_created: 5, vectors_upserted: 5 }) };
            }
            // POST /upload-pdf
            return { ok: true, json: async () => ({ status: 'processing' }) };
        };

        const result = await processIngestionJob(mockJob, {
            fetch: mockFetch,
            pollIntervalMs: 5,
            timeoutMs: 1000,
        });

        assert.equal(result.success, true);
        assert.equal(result.chunks, 5);

        // Verify final state
        const job = await DocumentJob.getById(jobId);
        assert.equal(job.status, STATUS.READY);
        assert.equal(job.stage, STAGE.READY);
        assert.equal(job.errorMessage, null);
    });

    test('6. Worker records terminal FAILED state when Python returns status === "error"', async () => {
        const jobId = `job_worker_fail_${Date.now()}`;
        const documentId = `doc_worker_fail_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId,
            userId: 'user_worker_06',
            filename: 'bad_curriculum.pdf',
            status: STATUS.QUEUED,
            stage: STAGE.QUEUED,
        });

        const mockJob = {
            id: `bull-${jobId}`,
            attemptsMade: 0,
            data: {
                jobId,
                documentId,
                userId: 'user_worker_06',
                filename: 'bad_curriculum.pdf',
                filePath: tempPdfPath,
                mimeType: 'application/pdf',
            },
        };

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                return {
                    ok: true,
                    json: async () => ({
                        status: 'error',
                        error: 'Document rejected: content not relevant to journalism domain',
                    }),
                };
            }
            return { ok: true, json: async () => ({ status: 'processing' }) };
        };

        await assert.rejects(
            async () => {
                await processIngestionJob(mockJob, {
                    fetch: mockFetch,
                    pollIntervalMs: 5,
                    timeoutMs: 1000,
                });
            },
            /Document rejected: content not relevant/
        );

        // Verify terminal FAILED state
        const job = await DocumentJob.getById(jobId);
        assert.equal(job.status, STATUS.FAILED);
        assert.equal(job.stage, STAGE.FAILED);
        assert.equal(job.errorCode, 'INGESTION_FAILED');
        assert.equal(job.errorMessage, 'Document rejected: content not relevant to journalism domain');
    });

    // ─────────────────────────────────────────────────────────────
    // 4. Job Retry Behavior & Authorization
    // ─────────────────────────────────────────────────────────────
    test('7. Failed job can be retried by owner via /api/chat/upload-retry/:jobId', async () => {
        const jobId = `job_retry_test_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId: `doc_retry_${Date.now()}`,
            userId: 'user_alice_retry',
            filename: 'ethics_doc.pdf',
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED',
            errorMessage: 'Temporary network timeout',
        });

        const tokenAlice = createToken({ id: 'user_alice_retry', email: 'alice@ignou.ac.in', role: 'student' });
        const tokenBob = createToken({ id: 'user_bob_intruder', email: 'bob@ignou.ac.in', role: 'student' });

        // Bob attempting to retry Alice's job receives 403
        const resBob = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenBob}` },
        });
        assert.equal(resBob.status, 403);
        const bobData = await resBob.json();
        assert.equal(bobData.message, 'Not authorized to retry this job');

        // Alice retrying own job succeeds
        let reAddedJob = null;
        ingestionQueue.add = async (name, data) => {
            reAddedJob = data;
            return { id: data.jobId };
        };

        const resAlice = await fetch(`${baseUrl}/api/chat/upload-retry/${jobId}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${tokenAlice}` },
        });
        assert.equal(resAlice.status, 200);
        const aliceData = await resAlice.json();
        assert.equal(aliceData.message, 'Job re-queued successfully');
        assert.equal(aliceData.status, STATUS.QUEUED);

        // Verify DocumentJob state was reset
        const job = await DocumentJob.getById(jobId);
        assert.equal(job.status, STATUS.QUEUED);
        assert.equal(job.stage, STAGE.QUEUED);
        assert.equal(job.errorCode, null);
        assert.equal(job.errorMessage, null);

        // Verify re-queued payload
        assert.ok(reAddedJob);
        assert.equal(reAddedJob.jobId, jobId);
    });

    // ─────────────────────────────────────────────────────────────
    // 5. Missing File on Disk Handling in Worker
    // ─────────────────────────────────────────────────────────────
    test('8. Worker immediately marks job as FAILED when file is missing from disk', async () => {
        const jobId = `job_missing_file_${Date.now()}`;
        await DocumentJob.create({
            jobId,
            documentId: `doc_missing_${Date.now()}`,
            userId: 'user_missing_08',
            filename: 'ghost.pdf',
            status: STATUS.QUEUED,
            stage: STAGE.QUEUED,
        });

        const mockJob = {
            id: `bull-${jobId}`,
            attemptsMade: 0,
            data: {
                jobId,
                documentId: `doc_missing_${Date.now()}`,
                userId: 'user_missing_08',
                filename: 'ghost.pdf',
                filePath: path.join(tempDir, 'non_existent_file_9999.pdf'),
                mimeType: 'application/pdf',
            },
        };

        await assert.rejects(
            async () => {
                await processIngestionJob(mockJob);
            },
            /Uploaded file not found on disk/
        );

        const job = await DocumentJob.getById(jobId);
        assert.equal(job.status, STATUS.FAILED);
        assert.equal(job.stage, STAGE.FAILED);
        assert.equal(job.errorCode, 'INGESTION_FAILED');
        assert.ok(job.errorMessage.includes('Uploaded file not found on disk'));
    });

    // ─────────────────────────────────────────────────────────────
    // 6. Status API Consistency
    // ─────────────────────────────────────────────────────────────
    test('9. GET /api/chat/upload-status/:jobId strictly reflects DocumentJob model state', async () => {
        const jobId = `job_consistency_${Date.now()}`;
        const job = await DocumentJob.create({
            jobId,
            documentId: `doc_const_${Date.now()}`,
            userId: 'user_const_09',
            filename: 'consistency.pdf',
            status: STATUS.READY,
            stage: STAGE.READY,
            size: 10240,
            mimeType: 'application/pdf',
        });

        const token = createToken({ id: 'user_const_09', email: 'const@ignou.ac.in', role: 'student' });
        const res = await fetch(`${baseUrl}/api/chat/upload-status/${jobId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        assert.equal(res.status, 200);
        const data = await res.json();
        assert.equal(data.jobId, job.jobId);
        assert.equal(data.status, STATUS.READY);
        assert.equal(data.stage, STAGE.READY);
        assert.equal(data.size, 10240);
        assert.equal(data.filename, 'consistency.pdf');
    });
});
