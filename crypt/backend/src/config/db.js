const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

let db;

const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) {
            db = admin.firestore();
            console.log('Firebase already initialized');
            return db;
        }

        const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json');
        
        try {
            // Priority: Service Account JSON file
            if (fs.existsSync(serviceAccountPath)) {
                admin.initializeApp({
                    credential: admin.credential.cert(require(serviceAccountPath)),
                    databaseURL: `https://${require(serviceAccountPath).project_id}.firebaseio.com`
                });
                console.log('Firebase initialized successfully using serviceAccountKey.json');
            } else {
                // Fallback: Environment variables
                const privateKey = (process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY || '').trim().replace(/^["']|["']$/g, '');
                const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').trim().replace(/^["']|["']$/g, '');
                const projectId = (process.env.FIREBASE_PROJECT_ID || '').trim().replace(/^["']|["']$/g, '');

                if (!projectId || !clientEmail || !privateKey) {
                    console.warn('Firebase environment variables missing and serviceAccountKey.json not found. Persistence will be disabled.');
                    return null;
                }

                admin.initializeApp({
                    credential: admin.credential.cert({
                        projectId,
                        clientEmail,
                        privateKey: privateKey.replace(/\\n/g, '\n')
                    }),
                    databaseURL: `https://${projectId}.firebaseio.com`
                });
                console.log('Firebase initialized successfully using environment variables');
            }
        } catch (initError) {
            console.error(`Firebase initialization error: ${initError.message}`);
            return null;
        }

        db = admin.firestore();
        return db;

    } catch (error) {
        console.error(`Firebase initialization error: ${error.message}`);
        return null;
    }
};

const getFirestore = () => {
    if (admin.apps.length === 0) {
        return null;
    }
    if (!db) {
        db = admin.firestore();
    }
    return db;
};

const getAuth = () => {
    if (admin.apps.length === 0) {
        return null;
    }
    return admin.auth();
};

module.exports = { initializeFirebase, getFirestore, getAuth };
