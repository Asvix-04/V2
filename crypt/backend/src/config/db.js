const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

let db;

const serviceAccountPath = path.resolve(__dirname, '../../firebase-key.json');

const normalizePrivateKey = (rawKey = '') => {
    let formattedKey = String(rawKey || '').replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    formattedKey = formattedKey.replace(/\\(?!n)/g, '');
    if (formattedKey && !formattedKey.endsWith('\n')) {
        formattedKey += '\n';
    }
    return formattedKey;
};

const getServiceAccountFromEnv = () => {
    const projectId = (process.env.FIREBASE_PROJECT_ID || '').replace(/^["']|["']$/g, '');
    const clientEmail = (process.env.FIREBASE_CLIENT_EMAIL || '').replace(/^["']|["']$/g, '');
    const privateKey = normalizePrivateKey(
        (process.env.FIREBASE_PRIVATE_KEY || process.env.PRIVATE_KEY || '').replace(/^["']|["']$/g, '')
    );

    if (!projectId || !clientEmail || !privateKey) {
        return null;
    }

    return { projectId, clientEmail, privateKey, source: 'environment variables' };
};

const getServiceAccountFromFile = () => {
    if (!fs.existsSync(serviceAccountPath)) {
        return null;
    }

    try {
        const raw = fs.readFileSync(serviceAccountPath, 'utf8');
        const parsed = JSON.parse(raw);

        if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
            return null;
        }

        return {
            projectId: parsed.project_id,
            clientEmail: parsed.client_email,
            privateKey: normalizePrivateKey(parsed.private_key),
            source: 'firebase-key.json'
        };
    } catch (error) {
        console.error(`Failed to read Firebase service account file: ${error.message}`);
        return null;
    }
};

const initializeFirebase = () => {
    try {
        if (admin.apps.length > 0) {
            db = admin.firestore();
            console.log('Firebase already initialized');
            return db;
        }

        const serviceAccount = getServiceAccountFromEnv() || getServiceAccountFromFile();

        if (!serviceAccount) {
            console.warn('Firebase environment variables missing. Persistence will be disabled.');
            return null;
        }

        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: serviceAccount.projectId,
                clientEmail: serviceAccount.clientEmail,
                privateKey: serviceAccount.privateKey
            }),
            databaseURL: `https://${serviceAccount.projectId}.firebaseio.com`
        });

        db = admin.firestore();
        console.log(`Firebase initialized successfully using ${serviceAccount.source}`);
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
