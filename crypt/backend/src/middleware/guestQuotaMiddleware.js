const { getFirestore } = require('../config/db');
const admin = require('firebase-admin');
const jwt = require('jsonwebtoken');

function classifyUser(req, res, next) {
    const auth = req.headers.authorization;
    let isAuthenticated = false;

    if (auth && auth.startsWith('Bearer ')) {
        try {
            const token = auth.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded && (decoded.id || decoded.uid)) {
                req.isGuest = false;
                req.userId = decoded.id || decoded.uid;
                isAuthenticated = true;
            }
        } catch (e) {
            // invalid/expired token - treat as guest
        }
    }

    if (!isAuthenticated) {
        req.isGuest = true;
        const guestId = req.headers['x-guest-id'] || req.headers['X-Guest-ID'];
        if (!guestId) {
            return res.status(400).json({ message: 'X-Guest-ID header is required for guest requests' });
        }
        req.guestId = guestId;
    }

    next();
}

async function reserveQuota(guestId) {
    const db = getFirestore();
    if (!db) {
        throw new Error('firestore_unavailable');
    }

    const docRef = db.collection('guest_quota').doc(guestId);
    let resultQuota = null;

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(docRef);
        const messagesUsed = doc.exists ? (doc.data().messagesUsed || 0) : 0;
        if (messagesUsed >= 5) {
            throw new Error('limit_exceeded');
        }
        const nextMessagesUsed = messagesUsed + 1;
        const updatedData = {
            guestId,
            messagesUsed: nextMessagesUsed,
            limit: 5,
            sessionStarted: true,
            updatedAt: new Date(),
            createdAt: doc.exists ? (doc.data().createdAt || new Date()) : new Date()
        };
        transaction.set(docRef, updatedData, { merge: true });
        resultQuota = {
            messagesUsed: nextMessagesUsed,
            limit: 5,
            sessionStarted: true
        };
    });

    return resultQuota;
}

async function compensateQuota(guestId) {
    const db = getFirestore();
    if (!db) return;

    const docRef = db.collection('guest_quota').doc(guestId);
    try {
        await db.runTransaction(async (transaction) => {
            const doc = await transaction.get(docRef);
            if (doc.exists) {
                const messagesUsed = doc.data().messagesUsed || 0;
                transaction.set(docRef, {
                    messagesUsed: Math.max(0, messagesUsed - 1),
                    updatedAt: new Date()
                }, { merge: true });
            }
        });
    } catch (err) {
        console.error('Failed to compensate guest quota:', err.message);
    }
}

async function getGuestQuotaData(guestId) {
    const db = getFirestore();
    if (!db) {
        throw new Error('firestore_unavailable');
    }
    const docRef = db.collection('guest_quota').doc(guestId);
    const doc = await docRef.get();
    const messagesUsed = doc.exists ? (doc.data().messagesUsed || 0) : 0;
    const sessionStarted = doc.exists ? !!doc.data().sessionStarted : false;
    return {
        messagesUsed,
        limit: 5,
        sessionStarted
    };
}

module.exports = {
    classifyUser,
    reserveQuota,
    compensateQuota,
    getGuestQuotaData
};
