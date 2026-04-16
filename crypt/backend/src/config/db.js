const admin = require('firebase-admin');

let db;

const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) {
            db = admin.firestore();
            console.log('Firebase already initialized');
            return db;
        }

        const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY || '').replace(/^["']|["']$/g, '');
        const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^["']|["']$/g, '');
        const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^["']|["']$/g, '');

        if (!projectId || !clientEmail || !privateKey) {
            console.warn('Firebase environment variables missing. Persistence will be disabled.');
            return null;
        }

        const rawKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY || '').replace(/^["']|["']$/g, '');
        
        // 1. Convert literal \n sequences to actual newlines
        let formattedKey = rawKey.replace(/\\n/g, '\n');
        
        // 2. Strip any remaining stray backslashes (common in mangled .env files)
        // PEM keys should not contain backslashes unless they are for newline escaping
        formattedKey = formattedKey.replace(/\\/g, '');
        
        // 3. Ensure the private key ends with a newline which is required for valid PEM
        if (formattedKey && !formattedKey.endsWith('\n')) {
            formattedKey += '\n';
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: projectId,
                clientEmail: clientEmail,
                privateKey: formattedKey
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
