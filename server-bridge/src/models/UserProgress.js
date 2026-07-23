const admin = require('firebase-admin');

const db = admin.apps.length ? admin.firestore() : admin.firestore();
const userProgressCollection = db.collection('user_progress');

class UserProgress {
    static async getByUserAndRoadmap(userId, roadmapId) {
        const snapshot = await userProgressCollection
            .where('userId', '==', userId)
            .where('roadmapId', '==', roadmapId)
            .limit(1)
            .get();

        if (snapshot.empty) return null;
        const doc = snapshot.docs[0];
        return { id: doc.id, ...doc.data() };
    }

    static async getUserProgress(userId) {
        const snapshot = await userProgressCollection
            .where('userId', '==', userId)
            .get();

        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    static async enroll(userId, roadmapId) {
        const existing = await this.getByUserAndRoadmap(userId, roadmapId);
        if (existing) return existing;

        const newProgress = {
            userId,
            roadmapId,
            completedTopicIds: [],
            active: true,
            lastAccessed: new Date().toISOString(),
            startedAt: new Date().toISOString()
        };

        const docRef = await userProgressCollection.add(newProgress);
        return { id: docRef.id, ...newProgress };
    }

    static async updateTopicProgress(userId, roadmapId, topicId, completed = true) {
        const progress = await this.getByUserAndRoadmap(userId, roadmapId);
        if (!progress) throw new Error('User not enrolled in this roadmap');

        let completedTopicIds = progress.completedTopicIds || [];

        if (completed) {
            if (!completedTopicIds.includes(topicId)) {
                completedTopicIds.push(topicId);
            }
        } else {
            completedTopicIds = completedTopicIds.filter(id => id !== topicId);
        }

        await userProgressCollection.doc(progress.id).update({
            completedTopicIds,
            lastAccessed: new Date().toISOString()
        });

        return { ...progress, completedTopicIds };
    }

    static async setActive(userId, roadmapId) {
        // This could be used to mark which roadmap is currently being viewed on dashboard
        // Ideally we want only one active at a time? Or just track lastAccessed.
        // For now, let's just update lastAccessed on the roadmap.
        const progress = await this.getByUserAndRoadmap(userId, roadmapId);
        if (!progress) return null;

        await userProgressCollection.doc(progress.id).update({
            lastAccessed: new Date().toISOString()
        });
        return { ...progress, lastAccessed: new Date().toISOString() };
    }
}

module.exports = UserProgress;
