const { getFirestore } = require('../config/db');

const DRAFT_TTL_MS = 6 * 60 * 60 * 1000;

const toDate = (value) => {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value;
    }

    if (typeof value.toDate === 'function') {
        return value.toDate();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
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
        this.isDraft = data.isDraft === true;
        this.draftExpiresAt = toDate(data.draftExpiresAt);
    }

    static buildDraftExpiry(baseDate = new Date()) {
        return new Date(baseDate.getTime() + DRAFT_TTL_MS);
    }

    static clearDraftExpiryTimer(id) {
        if (!id || !ChatSession.draftExpiryTimers) {
            return;
        }

        const timer = ChatSession.draftExpiryTimers.get(id);
        if (timer) {
            clearTimeout(timer);
            ChatSession.draftExpiryTimers.delete(id);
        }
    }

    static scheduleDraftExpiry(id, expiresAtValue) {
        const expiresAt = toDate(expiresAtValue);
        if (!id || !expiresAt) {
            return;
        }

        if (!ChatSession.draftExpiryTimers) {
            ChatSession.draftExpiryTimers = new Map();
        }

        ChatSession.clearDraftExpiryTimer(id);

        const delay = Math.max(0, expiresAt.getTime() - Date.now());
        const timer = setTimeout(async () => {
            ChatSession.draftExpiryTimers.delete(id);

            const db = getFirestore();
            if (!db) {
                return;
            }

            try {
                const docRef = db.collection('chat_sessions').doc(id);
                const doc = await docRef.get();

                if (!doc.exists) {
                    return;
                }

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

        if (typeof timer.unref === 'function') {
            timer.unref();
        }

        ChatSession.draftExpiryTimers.set(id, timer);
    }

    static isExpiredDraftData(data, now = new Date()) {
        if (!data || data.isDraft !== true) {
            return false;
        }

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
            isDraft: this.isDraft,
            draftExpiresAt: this.draftExpiresAt
        };
    }

    async save() {
        const db = getFirestore();
        if (!db) {
            throw new Error('Firestore not initialized');
        }

        try {
            const sessionsRef = db.collection('chat_sessions');
            const now = toDate(this.updatedAt) || new Date();
            const createdAt = toDate(this.createdAt) || now;
            const docRef = this.id ? sessionsRef.doc(this.id) : sessionsRef.doc();

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
                isDraft: this.isDraft,
                draftExpiresAt: this.draftExpiresAt
            }, { merge: true });

            if (this.isDraft) {
                ChatSession.scheduleDraftExpiry(this.id, this.draftExpiresAt);
            } else {
                ChatSession.clearDraftExpiryTimer(this.id);
            }

            return this;
        } catch (error) {
            throw new Error(`Failed to save chat session: ${error.message}`);
        }
    }

    static async purgeExpiredDrafts(options = {}) {
        const db = getFirestore();
        if (!db) {
            return 0;
        }

        try {
            const now = new Date();
            let query = db.collection('chat_sessions');

            if (options.userId) {
                query = query.where('userId', '==', options.userId);
            } else {
                query = query.where('isDraft', '==', true);
            }

            const snapshot = await query.get();
            const expiredDocs = snapshot.docs.filter((doc) => {
                const data = doc.data();
                return ChatSession.isExpiredDraftData(data, now);
            });

            if (!expiredDocs.length) {
                return 0;
            }

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

    static async findById(id, userId, options = {}) {
        const db = getFirestore();
        if (!db) {
            return null;
        }

        const docRef = db.collection('chat_sessions').doc(id);
        const doc = await docRef.get();

        if (!doc.exists) {
            return null;
        }

        const session = new ChatSession({ id: doc.id, ...doc.data() });

        if (session.userId !== userId) {
            return null;
        }

        if (session.isExpiredDraft()) {
            await docRef.delete();
            ChatSession.clearDraftExpiryTimer(id);
            return null;
        }

        if (!options.includeDeleted && session.deleted) {
            return null;
        }

        return session;
    }

    static async findByUserId(userId, options = {}) {
        const db = getFirestore();
        if (!db) {
            return [];
        }

        try {
            await ChatSession.purgeExpiredDrafts({ userId });

            const snapshot = await db.collection('chat_sessions')
                .where('userId', '==', userId)
                .get();

            const sessions = snapshot.docs.map((doc) => new ChatSession({
                id: doc.id,
                ...doc.data()
            }));

            sessions.forEach((session) => {
                if (session.isDraft) {
                    ChatSession.scheduleDraftExpiry(session.id, session.draftExpiresAt);
                }
            });

            let result = sessions;

            if (options.onlyDeleted) {
                result = result.filter((session) => session.deleted === true);
            } else if (!options.includeDeleted) {
                result = result.filter((session) => session.deleted !== true);
            }

            return result.sort((a, b) => {
                const dateA = toDate(a.updatedAt || a.timestamp) || new Date(0);
                const dateB = toDate(b.updatedAt || b.timestamp) || new Date(0);
                return dateB - dateA;
            });
        } catch (error) {
            console.error(`Error finding sessions for user ${userId}:`, error);
            return [];
        }
    }

    static async deleteById(id, userId) {
        const db = getFirestore();
        if (!db) {
            return false;
        }

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });

            if (!session) {
                return false;
            }

            await db.collection('chat_sessions').doc(id).set({
                deleted: true,
                deletedAt: new Date(),
                updatedAt: new Date(),
                isDraft: false,
                draftExpiresAt: null
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            return true;
        } catch (error) {
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    static async deleteDraftById(id, userId) {
        const db = getFirestore();
        if (!db) {
            return false;
        }

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });

            if (!session) {
                return false;
            }

            if (!session.isDraft) {
                return false;
            }

            await db.collection('chat_sessions').doc(id).delete();
            ChatSession.clearDraftExpiryTimer(id);
            return true;
        } catch (error) {
            throw new Error(`Failed to delete draft: ${error.message}`);
        }
    }

    static async deleteAllByUserId(userId) {
        const db = getFirestore();
        if (!db) {
            return;
        }

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
        } catch (error) {
            throw new Error(`Failed to clear history: ${error.message}`);
        }
    }

    static async restoreById(id, userId) {
        const db = getFirestore();
        if (!db) {
            return false;
        }

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });

            if (!session) {
                return false;
            }

            await db.collection('chat_sessions').doc(id).set({
                deleted: false,
                deletedAt: null,
                updatedAt: new Date(),
                isDraft: false,
                draftExpiresAt: null
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            return true;
        } catch (error) {
            throw new Error(`Failed to restore session: ${error.message}`);
        }
    }

    static async archiveById(id, userId) {
        const db = getFirestore();
        if (!db) {
            return null;
        }

        try {
            const session = await ChatSession.findById(id, userId, { includeDeleted: true });

            if (!session) {
                return null;
            }

            const updatedAt = new Date();
            await db.collection('chat_sessions').doc(id).set({
                isDraft: false,
                draftExpiresAt: null,
                updatedAt
            }, { merge: true });
            ChatSession.clearDraftExpiryTimer(id);

            session.isDraft = false;
            session.draftExpiresAt = null;
            session.updatedAt = updatedAt;

            return session;
        } catch (error) {
            throw new Error(`Failed to archive session: ${error.message}`);
        }
    }

    static startDraftPurgeWorker() {
        if (ChatSession.purgeWorker) {
            return;
        }

        ChatSession.purgeWorker = setInterval(() => {
            ChatSession.purgeExpiredDrafts().catch((error) => {
                console.error('Draft purge worker failed:', error);
            });
        }, 60 * 1000);

        if (typeof ChatSession.purgeWorker.unref === 'function') {
            ChatSession.purgeWorker.unref();
        }
    }
}

module.exports = ChatSession;
