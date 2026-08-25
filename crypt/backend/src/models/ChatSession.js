const { getFirestore } = require('../config/db');
const { getRedisClient } = require('../config/redis');

const DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const DISAPPEARING_CHAT_TTL_MS = 24 * 60 * 60 * 1000;


const toDate = (value) => {
    if (!value) return null;
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
    if (typeof value.toDate === 'function') return value.toDate();

    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const isExpired = (expiresAt, now = new Date()) => {
    const expiryDate = toDate(expiresAt);
    return expiryDate ? expiryDate <= now : false;
};

class ChatSession {
    constructor(data = {}) {
        const createdAt = toDate(data.createdAt || data.timestamp) || new Date();
        const updatedAt = toDate(data.updatedAt) || createdAt;

        this.id = data.id || null;
        this.userId = data.userId;
        this.title = data.title || 'New Chat';
        this.messages = Array.isArray(data.messages) ? data.messages : [];
        this.timestamp = createdAt;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.deleted = data.deleted === true;
        this.deletedAt = toDate(data.deletedAt);
        this.disappearingMode = Boolean(data.disappearingMode);
        this.expiresAt = toDate(data.expiresAt);
        this.isDraft = data.isDraft === true;
        this.draftExpiresAt = toDate(data.draftExpiresAt);
        this.unsentText = data.unsentText || "";
    }

    // ── Draft Expiry Helpers ─────────────────────────────────────────────────

    static buildDraftExpiry(baseDate = new Date()) {
        return new Date(baseDate.getTime() + DRAFT_TTL_MS);
    }

    static clearDraftExpiryTimer(id) {
        if (!id || !ChatSession.draftExpiryTimers) return;
        const timer = ChatSession.draftExpiryTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            ChatSession.draftExpiryTimers.delete(id);
        }
    }

    static scheduleDraftExpiry(id, expiresAtValue) {
        const expiresAt = toDate(expiresAtValue);
        if (!id || !expiresAt) return;

        if (!ChatSession.draftExpiryTimers) {
            ChatSession.draftExpiryTimers = new Map();
        }

        ChatSession.clearDraftExpiryTimer(id);

        // Node's setTimeout stores its delay as a 32-bit signed integer, so it
        // can't hold more than ~24.8 days (2^31 - 1 ms) — but DRAFT_TTL_MS is
        // 30 days. Passing the full remaining time straight through silently
        // overflowed: Node clamped it down to ~1ms and fired almost
        // instantly, the draft wasn't actually expired yet so this rescheduled
        // itself with the same still-30-days-away date, which overflowed and
        // fired instantly again — an infinite tight loop, which is exactly
        // what those repeated TimeoutOverflowWarning log lines were. Capping
        // the delay and re-checking once it elapses (without touching the
        // database unless the real expiry has actually passed) chains
        // multiple safe-sized waits instead.
        const MAX_TIMEOUT_MS = 2 ** 31 - 1;
        const remaining = Math.max(0, expiresAt.getTime() - Date.now());
        const delay = Math.min(remaining, MAX_TIMEOUT_MS);
        const timer = setTimeout(async () => {
            ChatSession.draftExpiryTimers.delete(id);
            if (Date.now() < expiresAt.getTime()) {
                // Only reached the cap, not the real expiry yet — wait out the rest.
                ChatSession.scheduleDraftExpiry(id, expiresAt);
                return;
            }
            const db = getFirestore();
            if (!db) return;
            try {
                const docRef = db.collection('chat_sessions').doc(id);
                const doc = await docRef.get();
                if (!doc.exists) return;
                const data = doc.data();
                if (ChatSession.isExpiredDraftData(data)) {
                    await docRef.delete();
                } else if (data?.isDraft === true) {
                    ChatSession.scheduleDraftExpiry(id, data.draftExpiresAt);
                }
            } catch (error) {
                console.error(`Failed to expire draft ${id}:`, error);
            }
        }, delay);

        if (typeof timer.unref === 'function') timer.unref();
        ChatSession.draftExpiryTimers.set(id, timer);
    }

    static isExpiredDraftData(data, now = new Date()) {
        if (!data || data.isDraft !== true) return false;
        const expiry = toDate(data.draftExpiresAt);
        return Boolean(expiry && expiry.getTime() <= now.getTime());
    }

    isExpiredDraft(now = new Date()) {
        return ChatSession.isExpiredDraftData(this, now);
    }

    toJSON() {
        return {
            id: this.id,
            userId: this.userId,
            title: this.title,
            messages: this.messages,
            timestamp: this.timestamp,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            deleted: this.deleted,
            deletedAt: this.deletedAt,
            disappearingMode: this.disappearingMode,
            expiresAt: this.expiresAt,
            isDraft: this.isDraft,
            draftExpiresAt: this.draftExpiresAt,
            unsentText: this.unsentText
        };
    }

    // ── Save / Update ────────────────────────────────────────────────────────

    async save() {
        const db = getFirestore();
        if (!db) throw new Error('Firestore not initialized');
        const redisClient = getRedisClient();

        try {
            const sessionsRef = db.collection('chat_sessions');
            const now = toDate(this.updatedAt) || new Date();
            const createdAt = toDate(this.createdAt) || now;
            const docRef = this.id ? sessionsRef.doc(this.id) : sessionsRef.doc();

            if (this.id) {
                const existingDoc = await docRef.get();
                if (existingDoc.exists) {
                    const existing = existingDoc.data();
                    if (existing.userId && existing.userId !== this.userId) {
                        throw new Error('Chat session does not belong to this user');
                    }
                    // Expired disappearing chats should not be resurrected by an old tab.
                    if (isExpired(existing.expiresAt)) {
                        await docRef.delete();
                    }
                }
            }

            this.id = docRef.id;
            this.createdAt = createdAt;
            this.timestamp = createdAt;
            this.updatedAt = now;
            this.deletedAt = this.deleted ? (toDate(this.deletedAt) || now) : null;
            this.draftExpiresAt = this.isDraft
                ? (toDate(this.draftExpiresAt) || ChatSession.buildDraftExpiry(now))
                : null;

            await docRef.set({
                userId: this.userId,
                title: this.title,
                messages: this.messages,
                timestamp: createdAt,
                createdAt,
                updatedAt: now,
                deleted: this.deleted,
                deletedAt: this.deletedAt,
                disappearingMode: this.disappearingMode,
                expiresAt: this.disappearingMode ? this.expiresAt : null,
                isDraft: this.isDraft,
                draftExpiresAt: this.draftExpiresAt,
                unsentText: this.unsentText
            }, { merge: true });

            if (this.isDraft) {
                ChatSession.scheduleDraftExpiry(this.id, this.draftExpiresAt);
            } else {
                ChatSession.clearDraftExpiryTimer(this.id);
            }

            // Invalidate Redis cache
            if (redisClient) {
                await redisClient.del(`chat_session:${this.id}`);
                await redisClient.del(`user_sessions:${this.userId}`);
            }

            return this;
        } catch (error) {
            throw new Error(`Failed to save chat session: ${error.message}`);
        }
    }

    // ── Purge Workers ────────────────────────────────────────────────────────

    static async purgeExpiredDrafts(options = {}) {
        const db = getFirestore();
        if (!db) return 0;

        try {
            const now = new Date();
            let query = db.collection('chat_sessions');
            if (options.userId) {
                query = query.where('userId', '==', options.userId);
            } else {
                query = query.where('isDraft', '==', true);
            }

            const snapshot = await query.get();
            const expiredDocs = snapshot.docs.filter((doc) =>
                ChatSession.isExpiredDraftData(doc.data(), now)
            );

            if (!expiredDocs.length) return 0;

            const batch = db.batch();
            expiredDocs.forEach((doc) => {
                ChatSession.clearDraftExpiryTimer(doc.id);
                batch.delete(doc.ref);
            });
            await batch.commit();
            return expiredDocs.length;
        } catch (error) {
            console.error('Failed to purge expired drafts:', error);
            return 0;
        }
    }

    static async deleteRefs(refs) {
        if (!refs.length) return;

        const db = getFirestore();
        if (!db) return;

        for (let i = 0; i < refs.length; i += 500) {
            const batch = db.batch();
            refs.slice(i, i + 500).forEach(ref => batch.delete(ref));
            await batch.commit();
        }
    }

    static startDraftPurgeWorker() {
        if (ChatSession.purgeWorker) return;

        ChatSession.purgeWorker = setInterval(() => {
            ChatSession.purgeExpiredDrafts().catch((error) => {
                console.error('Draft purge worker failed:', error);
            });
        }, 60 * 1000);

        if (typeof ChatSession.purgeWorker.unref === 'function') {
            ChatSession.purgeWorker.unref();
        }
    }

    // ── Finders ──────────────────────────────────────────────────────────────

    static async findById(id, userId, options = {}) {
        const db = getFirestore();
        if (!db) return null;

        const docRef = db.collection('chat_sessions').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) return null;

        const session = new ChatSession({ id: doc.id, ...doc.data() });
        if (session.userId !== userId) return null;

        if (isExpired(session.expiresAt)) {
            await docRef.delete();
            return null;
        }

        if (session.isExpiredDraft()) {
            await docRef.delete();
            ChatSession.clearDraftExpiryTimer(id);
            return null;
        }

        if (!options.includeDeleted && session.deleted) return null;

        return session;
    }

    static async findByUserId(userId, options = {}) {
        const db = getFirestore();
        if (!db) return [];
        const redisClient = getRedisClient();
        const cacheKey = `user_sessions:${userId}`;

        try {
            if (redisClient && !options.onlyDeleted && !options.includeDeleted) {
                const cached = await redisClient.get(cacheKey);
                if (cached) {
                    let parsed = JSON.parse(cached);
                    let hasExpired = false;
                    parsed = parsed.filter((item) => {
                        if (isExpired(item.expiresAt)) {
                            hasExpired = true;
                            db.collection('chat_sessions').doc(item.id).delete().catch(err => {
                                console.error('Error deleting expired session from firestore:', err);
                            });
                            return false;
                        }
                        return true;
                    });
                    if (hasExpired) {
                        redisClient.del(cacheKey).catch(err => {});
                    }
                    if (options.cursor) {
                        const cursorTime = new Date(options.cursor).getTime();
                        parsed = parsed.filter((item) => {
                            const val = item.updatedAt || item.timestamp || item.createdAt;
                            return new Date(val).getTime() < cursorTime;
                        });
                    }
                    if (options.limit > 0) {
                        parsed = parsed.slice(0, options.limit);
                    }
                    return parsed.map((data) => new ChatSession(data));
                }
            }
        } catch (err) { console.error('Redis error:', err); }

        try {
            await ChatSession.purgeExpiredDrafts({ userId });

            const snapshot = await db.collection('chat_sessions')
                .where('userId', '==', userId)
                .get();

            // Expired disappearing chats are purged here rather than just filtered,
            // so a stale tab can't resurrect them later.
            const expiredRefs = [];
            const activeSessions = [];

            snapshot.docs.forEach((doc) => {
                const data = doc.data();
                if (isExpired(data.expiresAt)) {
                    expiredRefs.push(doc.ref);
                    return;
                }
                activeSessions.push(new ChatSession({
                    id: doc.id,
                    ...data,
                    messages: [] // Omit messages for initial load to save bandwidth
                }));
            });

            await ChatSession.deleteRefs(expiredRefs);

            activeSessions.forEach((session) => {
                if (session.isDraft) {
                    ChatSession.scheduleDraftExpiry(session.id, session.draftExpiresAt);
                }
            });

            // Filter manually to avoid requiring composite Firestore indexes.
            let result = activeSessions;
            if (options.onlyDeleted) {
                result = result.filter((s) => s.deleted === true);
            } else if (!options.includeDeleted) {
                result = result.filter((s) => s.deleted !== true);
            }

            const sorted = result.sort((a, b) => {
                const dateA = toDate(a.updatedAt || a.timestamp) || new Date(0);
                const dateB = toDate(b.updatedAt || b.timestamp) || new Date(0);
                return dateB - dateA;
            });

            if (redisClient && !options.onlyDeleted && !options.includeDeleted) {
                await redisClient.setEx(cacheKey, 600, JSON.stringify(sorted.map((s) => s.toJSON())));
            }

            let paginated = sorted;
            if (options.cursor) {
                const cursorTime = new Date(options.cursor).getTime();
                paginated = paginated.filter((s) => {
                    const val = s.updatedAt || s.timestamp || s.createdAt;
                    return new Date(val).getTime() < cursorTime;
                });
            }
            if (options.limit > 0) {
                paginated = paginated.slice(0, options.limit);
            }

            return paginated;
        } catch (error) {
            console.error(`Error finding sessions for user ${userId}:`, error);
            return [];
        }
    }

    // Get session by ID with paginated messages (Cache-Aside pattern)
    static async findByIdWithPagination(id, userId, offset = 0, limit = 20) {
        const db = getFirestore();
        if (!db) return null;
        const redisClient = getRedisClient();
        const cacheKey = `chat_session:${id}`;

        let sessionData = null;

        try {
            if (redisClient) {
                const cached = await redisClient.get(cacheKey);
                if (cached) sessionData = JSON.parse(cached);
            }
        } catch (err) { console.error('Redis error:', err); }

        if (!sessionData) {
            const docRef = db.collection('chat_sessions').doc(id);
            const doc = await docRef.get();
            if (!doc.exists || doc.data().userId !== userId) return null;
            sessionData = { id: doc.id, ...doc.data() };
            if (redisClient) {
                try {
                    await redisClient.setEx(cacheKey, 3600, JSON.stringify(sessionData));
                } catch (err) { console.error('Redis set error:', err); }
            }
        }

        if (sessionData && isExpired(sessionData.expiresAt)) {
            db.collection('chat_sessions').doc(id).delete().catch(err => {
                console.error('Error deleting expired session from firestore:', err);
            });
            if (redisClient) {
                redisClient.del(cacheKey).catch(err => {});
                redisClient.del(`user_sessions:${userId}`).catch(err => {});
            }
            return null;
        }

        const messages = sessionData.messages || [];
        const totalMessages = messages.length;
        const startIndex = Math.max(totalMessages - offset - limit, 0);
        const endIndex = totalMessages - offset;
        const slicedMessages = endIndex > 0 ? messages.slice(startIndex, endIndex) : [];

        sessionData.messages = slicedMessages;
        sessionData.hasMore = startIndex > 0;
        return sessionData;
    }

    // ── Mutations ────────────────────────────────────────────────────────────

    static async deleteById(id, userId) {
        const db = getFirestore();
        if (!db) return false;
        const redisClient = getRedisClient();

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });
            if (!session) return false;

            await db.collection('chat_sessions').doc(id).set({
                deleted: true,
                deletedAt: new Date(),
                updatedAt: new Date(),
                isDraft: false,
                draftExpiresAt: null
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            if (redisClient) {
                await redisClient.del(`chat_session:${id}`);
                await redisClient.del(`user_sessions:${userId}`);
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    static async deleteDraftById(id, userId) {
        const db = getFirestore();
        if (!db) return false;
        const redisClient = getRedisClient();

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });
            if (!session || !session.isDraft) return false;

            await db.collection('chat_sessions').doc(id).delete();
            ChatSession.clearDraftExpiryTimer(id);

            if (redisClient) {
                await redisClient.del(`chat_session:${id}`);
                await redisClient.del(`user_sessions:${userId}`);
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to delete draft: ${error.message}`);
        }
    }

    static async deleteAllByUserId(userId) {
        const db = getFirestore();
        if (!db) return;
        const redisClient = getRedisClient();

        try {
            const snapshot = await db.collection('chat_sessions')
                .where('userId', '==', userId)
                .get();

            const batch = db.batch();
            const now = new Date();
            snapshot.docs.forEach((doc) => {
                ChatSession.clearDraftExpiryTimer(doc.id);
                batch.set(doc.ref, {
                    deleted: true,
                    deletedAt: now,
                    updatedAt: now,
                    isDraft: false,
                    draftExpiresAt: null
                }, { merge: true });
            });
            await batch.commit();

            if (redisClient) {
                await redisClient.del(`user_sessions:${userId}`);
            }
        } catch (error) {
            throw new Error(`Failed to clear history: ${error.message}`);
        }
    }

    static async restoreById(id, userId) {
        const db = getFirestore();
        if (!db) return false;
        const redisClient = getRedisClient();

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });
            if (!session) return false;

            await db.collection('chat_sessions').doc(id).set({
                deleted: false,
                deletedAt: null,
                updatedAt: new Date(),
                isDraft: false,
                draftExpiresAt: null
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            if (redisClient) {
                await redisClient.del(`chat_session:${id}`);
                await redisClient.del(`user_sessions:${userId}`);
            }
            return true;
        } catch (error) {
            throw new Error(`Failed to restore session: ${error.message}`);
        }
    }

    static async archiveById(id, userId) {
        const db = getFirestore();
        if (!db) return null;
        const redisClient = getRedisClient();

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });
            if (!session) return null;

            const updatedAt = new Date();
            await db.collection('chat_sessions').doc(id).set({
                isDraft: false,
                draftExpiresAt: null,
                updatedAt
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            if (redisClient) {
                await redisClient.del(`chat_session:${id}`);
                await redisClient.del(`user_sessions:${userId}`);
            }

            session.isDraft = false;
            session.draftExpiresAt = null;
            session.updatedAt = updatedAt;
            return session;
        } catch (error) {
            throw new Error(`Failed to archive session: ${error.message}`);
        }
    }

    static async updateTitleById(id, userId, title) {
        const db = getFirestore();
        if (!db) return null;
        const redisClient = getRedisClient();

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });
            if (!session) return null;

            const updatedAt = new Date();
            await db.collection('chat_sessions').doc(id).set({
                title,
                updatedAt
            }, { merge: true });

            if (redisClient) {
                await redisClient.del(`chat_session:${id}`);
                await redisClient.del(`user_sessions:${userId}`);
            }

            session.title = title;
            session.updatedAt = updatedAt;
            return session;
        } catch (error) {
            throw new Error(`Failed to update session title: ${error.message}`);
        }
    }
}

ChatSession.DISAPPEARING_CHAT_TTL_MS = DISAPPEARING_CHAT_TTL_MS;
ChatSession.isExpired = isExpired;
ChatSession.toDate = toDate;

module.exports = ChatSession;
