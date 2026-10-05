const { Queue, Worker } = require('bullmq');
const fs = require('fs');
const path = require('path');
const { DocumentJob, STATUS, STAGE } = require('../models/DocumentJob');

const PYTHON_BACKEND_URL = process.env.PYTHON_BACKEND_URL || 'http://localhost:8000';

const getRedisConnectionOptions = () => {
    const rawUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    try {
        const parsed = new URL(rawUrl);
        return {
            host: parsed.hostname || 'localhost',
            port: parseInt(parsed.port || '6379', 10),
            password: parsed.password || undefined,
            maxRetriesPerRequest: null,
        };
    } catch {
        return {
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: null,
        };
    }
};

const connection = getRedisConnectionOptions();

// Create ingestion queue
const ingestionQueue = new Queue('document-ingestion', {
    connection,
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 200,
    },
});

// Process ingestion job logic (exported for testability and worker execution)
const processIngestionJob = async (job, options = {}) => {
    const { jobId, documentId, userId, filename, filePath, mimeType } = job.data;
    const t0 = Date.now();
    const pythonBackendUrl = options.pythonBackendUrl || PYTHON_BACKEND_URL;
    const timeoutMs = options.timeoutMs ?? 180000; // 3 minutes
    const pollIntervalMs = options.pollIntervalMs ?? 1500;
    const customFetch = options.fetch || fetch;

    console.log(`[IngestionQueue] Started processing jobId=${jobId} file=${filename} user=${userId}`);

    await DocumentJob.update(jobId, {
        status: STATUS.PROCESSING,
        stage: STAGE.EXTRACTING,
    });

    if (!fs.existsSync(filePath)) {
        const fileNotFoundMsg = `Uploaded file not found on disk at: ${filePath}`;
        await DocumentJob.update(jobId, {
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED',
            errorMessage: fileNotFoundMsg,
        });
        throw new Error(fileNotFoundMsg);
    }

    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer], {
        type: mimeType || 'application/pdf',
    });
    const formData = new FormData();
    formData.append('file', blob, filename);
    if (documentId) {
        formData.append('document_id', documentId);
    }
    if (userId) {
        formData.append('user_id', userId);
    }
    if (jobId) {
        formData.append('job_id', jobId);
    }

    const uploadHeaders = {};
    if (userId) {
        uploadHeaders['X-Authenticated-User-Id'] = userId;
    }

    const uploadRes = await customFetch(`${pythonBackendUrl}/upload-pdf`, {
        method: 'POST',
        body: formData,
        headers: uploadHeaders,
    });

    if (!uploadRes.ok) {
        const errText = await uploadRes.text().catch(() => '');
        const uploadErrMsg = `Python RAG rejected upload (HTTP ${uploadRes.status}): ${errText}`;
        await DocumentJob.update(jobId, {
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED',
            errorMessage: uploadErrMsg,
        });
        throw new Error(uploadErrMsg);
    }

    // Poll Python /upload-pdf/status until completion
    const startTime = Date.now();
    let isDone = false;

    while (Date.now() - startTime < timeoutMs) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));

        let statusRes;
        try {
            statusRes = await customFetch(`${pythonBackendUrl}/upload-pdf/status`);
        } catch (netErr) {
            console.warn(`[IngestionQueue] Status poll network warning (jobId=${jobId}):`, netErr.message);
            continue;
        }

        if (!statusRes.ok) {
            console.warn(`[IngestionQueue] Status poll HTTP warning (jobId=${jobId}): HTTP ${statusRes.status}`);
            continue;
        }

        let statusData;
        try {
            statusData = await statusRes.json();
        } catch (parseErr) {
            console.warn(`[IngestionQueue] Status poll JSON parse warning (jobId=${jobId}):`, parseErr.message);
            continue;
        }

        if (statusData.status === 'done') {
            isDone = true;
            await DocumentJob.update(jobId, {
                status: STATUS.READY,
                stage: STAGE.READY,
                errorMessage: null,
            });
            console.log(`[IngestionQueue] Completed jobId=${jobId} file=${filename} in ${Date.now() - t0}ms`);
            return { success: true, chunks: statusData.chunks_created };
        } else if (statusData.status === 'error') {
            const errorMsg = statusData.error || 'Python ingestion encountered an error';
            const attempt = (job.attemptsMade || 0) + 1;
            const elapsedMs = Date.now() - t0;
            console.error(`[IngestionQueue] Ingestion failed downstream: jobId=${jobId} file=${filename} attempt=${attempt} elapsedMs=${elapsedMs} error="${errorMsg}"`);

            await DocumentJob.update(jobId, {
                status: STATUS.FAILED,
                stage: STAGE.FAILED,
                errorCode: 'INGESTION_FAILED',
                errorMessage: errorMsg,
            });

            throw new Error(errorMsg);
        } else if (statusData.vectors_upserted > 0) {
            await DocumentJob.update(jobId, { stage: STAGE.INDEXING });
        } else if (statusData.chunks_created > 0) {
            await DocumentJob.update(jobId, { stage: STAGE.EMBEDDING });
        }
    }

    if (!isDone) {
        const timeoutMsg = 'Document ingestion timed out after 3 minutes';
        const elapsedMs = Date.now() - t0;
        console.error(`[IngestionQueue] Ingestion timed out: jobId=${jobId} file=${filename} elapsedMs=${elapsedMs}`);
        await DocumentJob.update(jobId, {
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED',
            errorMessage: timeoutMsg,
        });
        throw new Error(timeoutMsg);
    }
};

// Process ingestion jobs with worker
const ingestionWorker = new Worker(
    'document-ingestion',
    async (job) => {
        return processIngestionJob(job);
    },
    {
        connection,
        concurrency: 1, // Sequential ingestion protects Pinecone and live BM25 rebuilds from concurrency collisions
    }
);

ingestionWorker.on('failed', async (job, err) => {
    console.error(`[IngestionQueue] Job failed: id=${job?.id} error=${err.message}`);
    if (job?.data?.jobId) {
        await DocumentJob.update(job.data.jobId, {
            status: STATUS.FAILED,
            stage: STAGE.FAILED,
            errorCode: 'INGESTION_FAILED',
            errorMessage: err.message,
        });
    }
});

ingestionWorker.on('error', (err) => {
    console.error('[IngestionQueue] Worker error:', err.message);
});

module.exports = {
    ingestionQueue,
    ingestionWorker,
    processIngestionJob,
};
