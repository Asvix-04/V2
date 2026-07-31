const { getFirestore } = require('../config/db');
const { getRedisClient } = require('../config/redis');

const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') return value.toDate();

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

class ResearchSession {
    constructor(data = {}) {
        const createdAt = toDate(data.createdAt || data.timestamp) || new Date();
        const updatedAt = toDate(data.updatedAt) || createdAt;

        this.id = data.id || null;
        this.userId = data.userId;
        this.title = data.title || 'New Research';
        this.messages = Array.isArray(data.messages) ? data.messages : [];
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
    }

    toJSON() {
        return {
            id: this.id,
            userId: this.userId,
            title: this.title,
            messages: this.messages,
            createdAt: this.createdAt ? this.createdAt.toISOString() : null,
            updatedAt: this.updatedAt ? this.updatedAt.toISOString() : null,
        };
    }

    static async findByUserId(userId) {
        const db = getFirestore();
        if (!db) return [];
        const redisClient = getRedisClient();
        const cacheKey = `user_research_sessions:${userId}`;

        try {
            if (redisClient) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    const parsed = JSON.parse(cached);
                    return parsed.map((data) => new ResearchSession(data));
                }
            }
        } catch (err) { console.error('Redis error in ResearchSession:', err); }

        try {
            const snapshot = await db.collection('research_sessions')
                .where('userId', '==', userId)
                .get();

            const sessions = snapshot.docs.map(doc => new ResearchSession({ id: doc.id, ...doc.data() }));

            const sorted = sessions.sort((a, b) => {
                const dateA = toDate(a.createdAt) || new Date(0);
                const dateB = toDate(b.createdAt) || new Date(0);
                return dateB - dateA;
            });

            if (redisClient) {
                await redisClient.setEx(cacheKey, 600, JSON.stringify(sorted.map((s) => s.toJSON())));
            }

            return sorted;
        } catch (error) {
            console.error(`Error finding research sessions for user ${userId}:`, error);
            return [];
        }
    }

    static async save(sessionData, userId) {
        const db = getFirestore();
        if (!db) return null;
        const redisClient = getRedisClient();
        const cacheKey = `user_research_sessions:${userId}`;

        const docId = sessionData.id;
        const dataToSave = {
            userId,
            title: sessionData.title || 'New Research',
            messages: Array.isArray(sessionData.messages) ? sessionData.messages : [],
            updatedAt: new Date(),
        };

        if (!sessionData.createdAt) {
            dataToSave.createdAt = new Date();
        } else {
            dataToSave.createdAt = toDate(sessionData.createdAt);
        }

        try {
            const docRef = db.collection('research_sessions').doc(docId);
            await docRef.set(dataToSave, { merge: true });

            if (redisClient) {
                await redisClient.del(cacheKey);
            }

            return new ResearchSession({ id: docId, ...dataToSave });
        } catch (error) {
            console.error("Failed to save research session:", error);
            throw error;
        }
    }

    static async delete(id, userId) {
        const db = getFirestore();
        if (!db) return false;
        const redisClient = getRedisClient();
        const cacheKey = `user_research_sessions:${userId}`;

        try {
            const docRef = db.collection('research_sessions').doc(id);
            const doc = await docRef.get();
            if (!doc.exists || doc.data().userId !== userId) return false;

            await docRef.delete();

            if (redisClient) {
                await redisClient.del(cacheKey);
            }

            return true;
        } catch (error) {
            console.error(`Error deleting research session ${id}:`, error);
            throw error;
        }
    }
}

module.exports = ResearchSession;
