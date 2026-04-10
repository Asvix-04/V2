const { getFirestore } = require('../config/db');

class ChatSession {
    constructor(data) {
        this.id = data.id || null;
        this.userId = data.userId;
        this.title = data.title || "New Chat";
        this.messages = data.messages || [];
        this.timestamp = data.timestamp || new Date();
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
                timestamp: this.timestamp instanceof Date ? this.timestamp : new Date(this.timestamp),
                updatedAt: new Date(),
                deleted: this.deleted || false
            };

            if (this.id) {
                // Update existing
                await sessionsRef.doc(this.id).update(sessionData);
            } else {
                // Create new
                const docRef = await sessionsRef.add({
                    ...sessionData,
                    createdAt: new Date()
                });
                this.id = docRef.id;
            }
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

        try {
            let query = sessionsRef.where('userId', '==', userId);

            // By default, don't show deleted
            if (arguments[1]?.onlyDeleted) {
                query = query.where('deleted', '==', true);
            } else if (!arguments[1]?.includeDeleted) {
                query = query.where('deleted', '==', false);
            }

            const snapshot = await query.get();

            const sessions = snapshot.docs.map(doc => new ChatSession({
                id: doc.id,
                ...doc.data()
            }));

            // Filter manually if composite index is missing for Firestore query
            // (Firestore requires explicit indices for multiple where/orderBy)
            let result = sessions;
            if (arguments[1]?.onlyDeleted) {
                result = result.filter(s => s.deleted === true);
            } else if (!arguments[1]?.includeDeleted) {
                result = result.filter(s => s.deleted !== true);
            }

            // Sort in memory to avoid needing a composite index in Firestore
            return result.sort((a, b) => {
                const dateA = new Date(a.updatedAt || a.timestamp);
                const dateB = new Date(b.updatedAt || b.timestamp);
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
}

module.exports = ChatSession;
