const { getFirestore } = require('../config/db');
const { getRedisClient } = require('../config/redis');

const STATUS = {
    QUEUED: 'QUEUED',
    PROCESSING: 'PROCESSING',
    READY: 'READY',
    FAILED: 'FAILED',
};

const STAGE = {
    QUEUED: 'QUEUED',
    EXTRACTING: 'EXTRACTING',
    EMBEDDING: 'EMBEDDING',
    INDEXING: 'INDEXING',
    READY: 'READY',
    FAILED: 'FAILED',
};

const inMemoryJobs = new Map();

class DocumentJob {
    constructor(data = {}) {
        this.jobId = data.jobId;
        this.documentId = data.documentId || data.jobId;
        this.userId = data.userId;
        this.filename = data.filename;
        this.filePath = data.filePath;
        this.fileUrl = data.fileUrl;
        this.mimeType = data.mimeType || 'application/pdf';
        this.size = data.size || 0;
        this.status = data.status || STATUS.QUEUED;
        this.stage = data.stage || STAGE.QUEUED;
        this.errorCode = data.errorCode || null;
        this.errorMessage = data.errorMessage || null;
        this.createdAt = data.createdAt || new Date().toISOString();
        this.updatedAt = data.updatedAt || new Date().toISOString();
    }

    toJSON() {
        return {
            jobId: this.jobId,
            documentId: this.documentId,
            userId: this.userId,
            filename: this.filename,
            fileUrl: this.fileUrl,
            mimeType: this.mimeType,
            size: this.size,
            status: this.status,
            stage: this.stage,
            errorCode: this.errorCode,
            errorMessage: this.errorMessage,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
        };
    }

    static async create(data) {
        const job = new DocumentJob(data);
        await job.save();
        return job;
    }

    async save() {
        this.updatedAt = new Date().toISOString();
        const payload = this.toJSON();
        inMemoryJobs.set(this.jobId, payload);
        const redisClient = getRedisClient();

        if (redisClient) {
            try {
                await redisClient.setEx(`doc_job:${this.jobId}`, 86400, JSON.stringify(payload));
            } catch (err) {
                console.error('[DocumentJob] Redis save error:', err.message);
            }
        }

        const db = getFirestore();
        if (db) {
            try {
                await db.collection('document_jobs').doc(this.jobId).set(payload, { merge: true });
            } catch (err) {
                console.error('[DocumentJob] Firestore save error:', err.message);
            }
        }
    }

    static async getById(jobId) {
        if (!jobId) return null;
        const redisClient = getRedisClient();

        if (redisClient) {
            try {
                const cached = await redisClient.get(`doc_job:${jobId}`);
                if (cached) {
                    return new DocumentJob(JSON.parse(cached));
                }
            } catch (err) {
                console.error('[DocumentJob] Redis get error:', err.message);
            }
        }

        const db = getFirestore();
        if (db) {
            try {
                const doc = await db.collection('document_jobs').doc(jobId).get();
                if (doc.exists) {
                    const data = doc.data();
                    if (redisClient) {
                        await redisClient.setEx(`doc_job:${jobId}`, 86400, JSON.stringify(data)).catch(() => {});
                    }
                    return new DocumentJob(data);
                }
            } catch (err) {
                console.error('[DocumentJob] Firestore get error:', err.message);
            }
        }

        if (inMemoryJobs.has(jobId)) {
            return new DocumentJob(inMemoryJobs.get(jobId));
        }

        return null;
    }

    static async update(jobId, updates = {}) {
        const job = await DocumentJob.getById(jobId);
        if (!job) return null;

        Object.assign(job, updates);
        await job.save();
        return job;
    }
}

module.exports = {
    DocumentJob,
    STATUS,
    STAGE,
};
