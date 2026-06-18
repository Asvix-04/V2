const { getFirestore } = require('../config/db');

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
    constructor(data) {
        this.id = data.id || null;
        this.userId = data.userId;
        this.title = data.title || "New Chat";
        this.messages = data.messages || [];
        this.timestamp = toDate(data.timestamp) || new Date();
        this.updatedAt = toDate(data.updatedAt);
        this.createdAt = toDate(data.createdAt);
        this.deleted = data.deleted || false;
        this.deletedAt = toDate(data.deletedAt);
        this.disappearingMode = Boolean(data.disappearingMode);
        this.expiresAt = toDate(data.expiresAt);
    }

    // Save or update session
    async save() {
        const db = getFirestore();
        if (!db) throw new Error('Firestore not initialized');
        const sessionsRef = db.collection('chat_sessions');

        try {
            const sessionData = {
                userId: this.userId,
                title: this.title,
                messages: this.messages,
                timestamp: this.timestamp,
                updatedAt: new Date(),
                deleted: this.deleted || false,
                disappearingMode: this.disappearingMode,
                expiresAt: this.disappearingMode ? this.expiresAt : null
            };

            if (this.id) {
                const docRef = sessionsRef.doc(this.id);
                const existingDoc = await docRef.get();

                if (existingDoc.exists) {
                    const existing = existingDoc.data();

                    if (existing.userId !== this.userId) {
                        throw new Error('Chat session does not belong to this user');
                    }

                    if (!isExpired(existing.expiresAt)) {
                        await docRef.update(sessionData);
                        return this;
                    }

                    // Expired disappearing chats should not be resurrected by an old tab.
                    await docRef.delete();
                }
            }

            const docRef = await sessionsRef.add({
                ...sessionData,
                createdAt: new Date()
            });
            this.id = docRef.id;
            return this;
        } catch (error) {
            throw new Error(`Failed to save chat session: ${error.message}`);
        }
    }

    // Find all sessions for a user
    static async findByUserId(userId) {
        const db = getFirestore();
        if (!db) return [];
        const sessionsRef = db.collection('chat_sessions');
        const options = arguments[1] || {};

        try {
            let query = sessionsRef.where('userId', '==', userId);
            const snapshot = await query.get();
            const expiredDocs = [];
            const activeDocs = [];

            snapshot.docs.forEach(doc => {
                if (isExpired(doc.data().expiresAt)) {
                    expiredDocs.push(doc.ref);
                    return;
                }

                activeDocs.push(doc);
            });

            await ChatSession.deleteRefs(expiredDocs);

            const sessions = activeDocs.map(doc => new ChatSession({
                id: doc.id,
                ...doc.data()
            }));

            // Filter manually to avoid requiring composite Firestore indexes.
            let result = sessions;
            if (options.onlyDeleted) {
                result = result.filter(s => s.deleted === true);
            } else if (!options.includeDeleted) {
                result = result.filter(s => s.deleted !== true);
            }

            // Sort in memory to avoid needing a composite index in Firestore
            return result.sort((a, b) => {
                const dateA = toDate(a.updatedAt) || toDate(a.timestamp) || new Date(0);
                const dateB = toDate(b.updatedAt) || toDate(b.timestamp) || new Date(0);
                return dateB - dateA;
            });
        } catch (error) {
            console.error(`Error finding sessions for user ${userId}:`, error);
            // If index is missing or other firestore error, return empty array instead of crashing
            return [];
        }
    }

    // Delete a specific session
    static async deleteById(id, userId) {
        const db = getFirestore();
        if (!db) return false;

        try {
            const docRef = db.collection('chat_sessions').doc(id);
            const doc = await docRef.get();

            if (doc.exists && doc.data().userId === userId) {
                await docRef.update({
                    deleted: true,
                    deletedAt: new Date(),
                    updatedAt: new Date()
                });
                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Failed to delete session: ${error.message}`);
        }
    }

    // Delete all sessions for a user
    static async deleteAllByUserId(userId) {
        const db = getFirestore();
        if (!db) return;

        try {
            const snapshot = await db.collection('chat_sessions')
                .where('userId', '==', userId)
                .get();

            const batch = db.batch();
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, {
                    deleted: true,
                    deletedAt: new Date(),
                    updatedAt: new Date()
                });
            });
            await batch.commit();
        } catch (error) {
            throw new Error(`Failed to clear history: ${error.message}`);
        }
    }

    // Restore a specific session
    static async restoreById(id, userId) {
        const db = getFirestore();
        if (!db) return false;

        try {
            const docRef = db.collection('chat_sessions').doc(id);
            const doc = await docRef.get();

            if (doc.exists && doc.data().userId === userId) {
                await docRef.update({
                    deleted: false,
                    deletedAt: null,
                    updatedAt: new Date()
                });
                return true;
            }
            return false;
        } catch (error) {
            throw new Error(`Failed to restore session: ${error.message}`);
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
}

ChatSession.DISAPPEARING_CHAT_TTL_MS = DISAPPEARING_CHAT_TTL_MS;
ChatSession.isExpired = isExpired;
ChatSession.toDate = toDate;

module.exports = ChatSession;
