const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json');

const connectDB = async () => {
    try {
        if (!admin.apps.length) {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
            console.log('Firebase Admin SDK Initialized -> Firestore Connected');
        }
    } catch (error) {
        console.error('Firebase Initialization Error:', error.message);
        process.exit(1);
    }
};

const db = admin.apps.length ? admin.firestore() : null; // Access via exports if needed elsewhere, though usually admin.firestore() is global enough

module.exports = connectDB;
