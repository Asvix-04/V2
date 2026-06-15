const { getFirestore } = require('./src/config/db');
async function insert() {
    try {
        const db = getFirestore();
        if (!db) { console.log('no db'); return; }
        
        const newSession = {
            userId: 'JpxzTr5N2xwZoHRljwHw',
            title: "My First Test Draft",
            messages: [
                { role: 'assistant', content: 'Hello! I am your AI assistant.' },
                { role: 'user', content: 'This is a test draft.' }
            ],
            isDraft: true,
            draftExpiresAt: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString(),
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        const docRef = await db.collection('chat_sessions').add(newSession);
        console.log(`Successfully created test draft! ID: ${docRef.id}`);
        
        const { getRedisClient } = require('./src/config/redis');
        const redis = getRedisClient();
        if (redis) {
            await redis.del(`user_sessions:JpxzTr5N2xwZoHRljwHw`);
            console.log('Cleared redis cache for user');
        }
        process.exit(0);
    } catch(e) {
        console.error(e);
        process.exit(1);
    }
}
insert();
