const { getFirestore } = require('../config/db');

class DeepResearchUsage {
    constructor(data) {
        this.id = data.id || null;
        this.userId = data.userId;
        // Keep requestedAt as Date object
        this.requestedAt = data.requestedAt ? (data.requestedAt instanceof Date ? data.requestedAt : new Date(data.requestedAt)) : new Date();
    }

    // Save record to Firestore
    async save() {
        const db = getFirestore();
        if (!db) throw new Error('Firestore not initialized');
        const usageRef = db.collection('deep_research_usage');

        try {
            const usageData = {
                userId: this.userId,
                requestedAt: this.requestedAt,
                createdAt: new Date()
            };

            const docRef = await usageRef.add(usageData);
            this.id = docRef.id;
            return this;
        } catch (error) {
            throw new Error(`Failed to save research usage log: ${error.message}`);
        }
    }

    // Find all usage entries in the last 30 days for a specific user (filters in memory to avoid Firestore composite index errors)
    static async findActiveInWindow(userId, windowDays = 30) {
        const db = getFirestore();
        if (!db) return [];
        const usageRef = db.collection('deep_research_usage');

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - windowDays);
        // thirtyDaysAgo.setMinutes(thirtyDaysAgo.getMinutes() - 2);

        try {
            // Firestore single field query (no composite index required)
            const snapshot = await usageRef.where('userId', '==', userId).get();

            const logs = snapshot.docs
                .map(doc => {
                    const data = doc.data();
                    const requestedAt = (data.requestedAt && data.requestedAt.toDate)
                        ? data.requestedAt.toDate()
                        : new Date(data.requestedAt || Date.now());
                    return new DeepResearchUsage({
                        id: doc.id,
                        ...data,
                        requestedAt
                    });
                })
                .filter(log => log.requestedAt >= thirtyDaysAgo);

            // Sort logs by requestedAt ascending
            return logs.sort((a, b) => a.requestedAt - b.requestedAt);
        } catch (error) {
            console.error(`Error finding usage logs for user ${userId}:`, error.message);
            return [];
        }
    }
}

module.exports = DeepResearchUsage;
