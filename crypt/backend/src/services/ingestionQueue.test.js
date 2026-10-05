const { test, describe, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
    ingestionQueue,
    ingestionWorker,
    processIngestionJob,
} = require('./ingestionQueue');
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');

describe('Phase 1: Ingestion Queue Reliability & Failure Propagation', () => {
    let tempFilePath;
    let tempDir;

    before(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digilab-test-'));
        tempFilePath = path.join(tempDir, 'sample_doc.pdf');
        fs.writeFileSync(tempFilePath, Buffer.from('%PDF-1.4 Mock PDF content for testing'));
    });

    after(async () => {
        try {
            if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
            if (fs.existsSync(tempDir)) fs.rmdirSync(tempDir);
        } catch (e) {
            // ignore cleanup errors
        }

        // Close BullMQ worker & queue connections so node test runner exits cleanly
        await ingestionWorker.close();
        await ingestionQueue.close();
    });

    const createMockJob = (jobId, attemptsMade = 0) => ({
        id: `bull-job-${jobId}`,
        attemptsMade,
        data: {
            jobId,
            documentId: `doc-${jobId}`,
            userId: 'test-user-123',
            filename: 'sample_doc.pdf',
            filePath: tempFilePath,
            mimeType: 'application/pdf',
        },
    });

    test('1. When Python returns status === "processing", the worker continues polling', async () => {
        const jobId = 'job-test-processing-loop';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        let pollCount = 0;
        const mockFetch = async (url, opts) => {
            if (url.includes('/upload-pdf/status')) {
                pollCount++;
                if (pollCount < 3) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ status: 'processing', chunks_created: 0, vectors_upserted: 0 }),
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'done', chunks_created: 7, vectors_upserted: 7 }),
                };
            }
            // /upload-pdf POST
            return {
                ok: true,
                status: 200,
                json: async () => ({ message: 'Uploaded successfully' }),
            };
        };

        const result = await processIngestionJob(createMockJob(jobId), {
            fetch: mockFetch,
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        assert.equal(result.success, true);
        assert.equal(result.chunks, 7);
        assert.ok(pollCount >= 3, `Expected at least 3 polls, got ${pollCount}`);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.READY);
        assert.equal(savedJob.stage, STAGE.READY);
        assert.equal(savedJob.errorMessage, null);
    });

    test('2. When Python returns status === "done", the worker completes successfully with chunk count', async () => {
        const jobId = 'job-test-done-success';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'done', chunks_created: 14, vectors_upserted: 14 }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const result = await processIngestionJob(createMockJob(jobId), {
            fetch: mockFetch,
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        assert.deepEqual(result, { success: true, chunks: 14 });

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.READY);
        assert.equal(savedJob.stage, STAGE.READY);
        assert.equal(savedJob.errorMessage, null);
    });

    test('3. When Python returns status === "error", the worker immediately fails, polling stops, and DocumentJob becomes FAILED', async () => {
        const jobId = 'job-test-immediate-error';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        let statusPollCount = 0;
        const pythonErrorMessage = 'Document rejected: content not relevant to cybersecurity domain';

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                statusPollCount++;
                if (statusPollCount === 1) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({ status: 'processing' }),
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'error', error: pythonErrorMessage }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const startTime = Date.now();
        await assert.rejects(
            async () => {
                await processIngestionJob(createMockJob(jobId), {
                    fetch: mockFetch,
                    pollIntervalMs: 20,
                    timeoutMs: 10000, // Long timeout to verify we don't wait for timeout
                });
            },
            (err) => {
                assert.match(err.message, /Document rejected: content not relevant to cybersecurity domain/);
                return true;
            }
        );
        const duration = Date.now() - startTime;

        // Polling MUST have terminated immediately without waiting for timeout
        assert.equal(statusPollCount, 2);
        assert.ok(duration < 2000, `Expected immediate failure in < 2000ms, took ${duration}ms`);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.FAILED);
        assert.equal(savedJob.stage, STAGE.FAILED);
        assert.equal(savedJob.errorCode, 'INGESTION_FAILED');
        assert.equal(savedJob.errorMessage, pythonErrorMessage);
    });

    test('4. When Python status endpoint throws temporary network/request error, polling continues until recovery', async () => {
        const jobId = 'job-test-network-recovery';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        let pollAttempt = 0;
        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                pollAttempt++;
                if (pollAttempt === 1) {
                    throw new Error('ECONNRESET: socket hang up');
                }
                if (pollAttempt === 2) {
                    return {
                        ok: false,
                        status: 502,
                        text: async () => 'Bad Gateway',
                    };
                }
                if (pollAttempt === 3) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => {
                            throw new Error('SyntaxError: Unexpected token < in JSON');
                        },
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'done', chunks_created: 8 }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const result = await processIngestionJob(createMockJob(jobId), {
            fetch: mockFetch,
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        assert.equal(result.success, true);
        assert.equal(result.chunks, 8);
        assert.equal(pollAttempt, 4);

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.READY);
    });

    test('5. When Python never reaches a terminal state, worker still times out at safety limit and fails', async () => {
        const jobId = 'job-test-timeout';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'processing', chunks_created: 0 }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        await assert.rejects(
            async () => {
                await processIngestionJob(createMockJob(jobId), {
                    fetch: mockFetch,
                    pollIntervalMs: 20,
                    timeoutMs: 80, // short test timeout
                });
            },
            (err) => {
                assert.match(err.message, /timed out/i);
                return true;
            }
        );

        const savedJob = await DocumentJob.getById(jobId);
        assert.equal(savedJob.status, STATUS.FAILED);
        assert.equal(savedJob.stage, STAGE.FAILED);
        assert.equal(savedJob.errorCode, 'INGESTION_FAILED');
        assert.match(savedJob.errorMessage, /timed out/i);
    });

    test('6. BullMQ retry configuration and failure rethrow behavior is preserved', async () => {
        // Verify BullMQ queue default options
        const defaultOptions = ingestionQueue.defaultJobOptions;
        assert.equal(defaultOptions.attempts, 2, 'BullMQ attempts must remain 2');
        assert.deepEqual(defaultOptions.backoff, {
            type: 'exponential',
            delay: 2000,
        }, 'BullMQ backoff must remain exponential with 2000ms delay');

        // Verify that processIngestionJob rethrows the error on attempt 1
        const jobId = 'job-test-retry-rethrow';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'error', error: 'Temporary service error' }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const mockJobAttempt1 = createMockJob(jobId, 0); // attemptsMade = 0

        // Attempt 1 must throw an unhandled error so BullMQ can capture it and schedule retry
        await assert.rejects(
            async () => {
                await processIngestionJob(mockJobAttempt1, {
                    fetch: mockFetch,
                    pollIntervalMs: 10,
                    timeoutMs: 1000,
                });
            },
            (err) => {
                assert.equal(err.message, 'Temporary service error');
                return true;
            }
        );

        // Attempt 2 simulated: recovers
        const mockJobAttempt2 = createMockJob(jobId, 1); // attemptsMade = 1
        const mockRecoverFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({ status: 'done', chunks_created: 10 }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const result = await processIngestionJob(mockJobAttempt2, {
            fetch: mockRecoverFetch,
            pollIntervalMs: 10,
            timeoutMs: 1000,
        });

        assert.equal(result.success, true);
        assert.equal(result.chunks, 10);
    });

    test('7. Successful existing ingestion happy path is unchanged with stage transitions', async () => {
        const jobId = 'job-test-happy-path-stages';
        await DocumentJob.create({ jobId, filename: 'sample_doc.pdf', status: STATUS.QUEUED });

        let step = 0;
        const mockFetch = async (url) => {
            if (url.includes('/upload-pdf/status')) {
                step++;
                if (step === 1) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            status: 'processing',
                            chunks_created: 6,
                            vectors_upserted: 0,
                        }),
                    };
                }
                if (step === 2) {
                    return {
                        ok: true,
                        status: 200,
                        json: async () => ({
                            status: 'processing',
                            chunks_created: 6,
                            vectors_upserted: 6,
                        }),
                    };
                }
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        status: 'done',
                        chunks_created: 6,
                        vectors_upserted: 6,
                    }),
                };
            }
            return { ok: true, status: 200, json: async () => ({}) };
        };

        const result = await processIngestionJob(createMockJob(jobId), {
            fetch: mockFetch,
            pollIntervalMs: 10,
            timeoutMs: 5000,
        });

        assert.deepEqual(result, { success: true, chunks: 6 });

        const finalJob = await DocumentJob.getById(jobId);
        assert.equal(finalJob.status, STATUS.READY);
        assert.equal(finalJob.stage, STAGE.READY);
        assert.equal(finalJob.errorMessage, null);
    });
});
