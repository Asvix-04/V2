const { getFirestore } = require('./backend/src/config/db');
async function test() {
    try {
        const db = getFirestore();
        if (!db) { console.log('no db'); return; }
        const snapshot = await db.collection('chat_sessions').where('isDraft', '==', true).get();
        console.log(`Found ${snapshot.docs.length} drafts in DB.`);
    } catch(e) {
        console.error(e);
    }
}
test();
