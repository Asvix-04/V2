const admin = require('firebase-admin');

// Note: Ensure admin.initializeApp() is called before this is used.
// Usually handled in db.js or app.js
const db = admin.apps.length ? admin.firestore() : admin.firestore();
const roadmapsCollection = db.collection('roadmaps');

class Roadmap {
    static async create(data) {
        const docRef = await roadmapsCollection.add({
            ...data,
            createdAt: new Date().toISOString()
        });
        return { id: docRef.id, ...data };
    }

    static async getAll() {
        const snapshot = await roadmapsCollection.get();
        if (snapshot.empty) return [];
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }

    static async getById(id) {
        const doc = await roadmapsCollection.doc(id).get();
        if (!doc.exists) return null;
        return { id: doc.id, ...doc.data() };
    }

    static async delete(id) {
        await roadmapsCollection.doc(id).delete();
        return { id };
    }
}

module.exports = Roadmap;
