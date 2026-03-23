const admin = require('firebase-admin');

let db;

const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) {
            db = admin.firestore();
            console.log('Firebase already initialized');
            return db;
        }

        const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
        const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim().replace(/^["']|["']$/g, '');
        const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim().replace(/^["']|["']$/g, '');

        if (!projectId || !clientEmail || !privateKey) {
            console.warn('Firebase environment variables missing. Persistence will be disabled.');
            return null;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: projectId,
                clientEmail: clientEmail,
                privateKey: privateKey.replace(/\\n/g, '\n')
            }),
            databaseURL: `https://${projectId}.firebaseio.com`
        });

        db = admin.firestore();
        console.log('Firebase initialized successfully');
        return db;

    } catch (error) {
        console.error(`Firebase initialization error: ${error.message}`);
        return null;
    }
};

const getFirestore = () => {
    if (!db) {
        initializeFirebase();
    }
    return db;
};

const getAuth = () => {
    return admin.auth();
};

module.exports = { initializeFirebase, getFirestore, getAuth };
