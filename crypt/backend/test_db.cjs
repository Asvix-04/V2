const { getFirestore } = require('./src/config/db');
async function test() {
    try {
        const db = getFirestore();
        if (!db) { console.log('no db'); return; }
        const snapshot = await db.collection('chat_sessions').limit(1).get();
        if (snapshot.empty) { console.log('No sessions found'); return; }
        console.log(`User ID: ${snapshot.docs[0].data().userId}`);
    } catch(e) {
        console.error(e);
    }
}
test();
