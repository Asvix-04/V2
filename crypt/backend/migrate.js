// Migration helper script - Use this to migrate existing MongoDB data to Firestore
// Run with: node migrate.js

const admin = require('firebase-admin');
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config();

// Initialize Firebase
const serviceAccount = require(path.join(__dirname, './firebase-key.json'));

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Connect to MongoDB
const mongoUri = process.env.MONGO_URI;

async function migrateData() {
    try {
        // Connect to MongoDB
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Get all users from MongoDB
        const MongoUser = mongoose.model('User', new mongoose.Schema({
            name: String,
            email: String,
            password: String,
            role: String,
            createdAt: Date
        }));

        const users = await MongoUser.find();
        console.log(`Found ${users.length} users in MongoDB`);

        // Migrate to Firestore
        const batch = db.batch();
        let count = 0;

        for (const user of users) {
            const docRef = db.collection('users').doc();
            batch.set(docRef, {
                name: user.name,
                email: user.email,
                password: user.password, // Already hashed in MongoDB
                role: user.role || 'student',
                createdAt: user.createdAt || new Date()
            });
            count++;
        }

        // Commit the batch
        await batch.commit();
        console.log(`Successfully migrated ${count} users to Firestore`);

        // Close MongoDB connection
        await mongoose.disconnect();
        process.exit(0);

    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

// Run migration
migrateData();
