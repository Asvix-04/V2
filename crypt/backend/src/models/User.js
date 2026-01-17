const admin = require('firebase-admin');

// Collection Reference
// Note: db.js handles initialization, so admin.firestore() should work if db.js runs first.
// However, models are imported in controllers. We need to ensure initialization happens.
// In this architecture, db.js is imported in app.js and run.
// So this file will be required *after* initialization if required in controllers.
// But valid to double check or lazy load.

const db = admin.apps.length ? admin.firestore() : admin.firestore();
const usersCollection = db.collection('users');

class User {
    static async create(userData) {
        const newUser = {
            name: userData.name,
            email: userData.email,
            password: userData.password,
            role: userData.role || 'student',
            profilePhoto: userData.profilePhoto || '',
            preferredName: userData.preferredName || '',
            age: userData.age || null,
            gender: userData.gender || '',
            location: userData.location || '',
            primaryLanguage: userData.primaryLanguage || 'en',
            accountStatus: userData.accountStatus || 'active',
            preferences: {
                language: 'en',
                tone: 'neutral',
                ...(userData.preferences || {})
            },
            createdAt: new Date().toISOString()
        };

        // Unique Email Check
        const existingSnapshot = await usersCollection.where('email', '==', newUser.email).limit(1).get();
        if (!existingSnapshot.empty) {
            throw new Error('User already exists');
        }

        const docRef = await usersCollection.add(newUser);
        return { _id: docRef.id, ...newUser };
    }

    static async findOne(query) {
        if (query.email) {
            const snapshot = await usersCollection.where('email', '==', query.email).limit(1).get();
            if (snapshot.empty) return null;
            const doc = snapshot.docs[0];
            return { _id: doc.id, ...doc.data() };
        }
        return null;
    }

    static async findById(id) {
        try {
            const doc = await usersCollection.doc(id).get();
            if (!doc.exists) return null;
            return { _id: doc.id, ...doc.data() };
        } catch (error) {
            return null;
        }
    }

    static async update(id, updateData) {
        // Remove _id to prevent overwriting document key field (though Firestore ignores it usually)
        const { _id, ...data } = updateData;
        await usersCollection.doc(id).update(data);
        const doc = await usersCollection.doc(id).get();
        return { _id: doc.id, ...doc.data() };
    }
}

module.exports = User;
