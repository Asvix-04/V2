const redis = require('redis');

let redisClient = null;

/**
 * Wraps @upstash/redis (their REST/HTTPS client) so it exposes the same
 * .get/.del/.setEx surface that ChatSession.js already calls — so nothing
 * outside this file needs to know or care which client is actually active.
 * Only naming difference: Upstash's SDK uses lowercase `setex`, not the
 * camelCase `setEx` node-redis uses.
 */
function wrapUpstashRestClient(client) {
    return {
        get: (key) => client.get(key),
        del: (key) => client.del(key),
        setEx: (key, seconds, value) => client.setex(key, seconds, value),
    };
}

const initializeRedis = async () => {
    // Prefer Upstash's REST API (plain HTTPS, port 443) when its credentials
    // are present. We found that raw TCP+TLS connections from Node to
    // Upstash on port 6379 silently time out specifically inside the
    // Hugging Face Space container — confirmed via diagnostics: DNS
    // resolved fine, Python's TCP-based client connected successfully from
    // the very same container, and this exact TCP code connected fine from
    // a normal machine outside HF. Since this app already successfully
    // makes HTTPS calls from that same container (Gemini, Pinecone, etc.),
    // routing Redis through HTTPS too sidesteps whatever is blocking the
    // raw TCP path there, without needing to change anything for local dev
    // (Memurai) or Render, where the regular TCP client already works fine.
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        try {
            const { Redis } = require('@upstash/redis');
            const upstashClient = new Redis({
                url: process.env.UPSTASH_REDIS_REST_URL,
                token: process.env.UPSTASH_REDIS_REST_TOKEN,
            });
            await upstashClient.get('__connectivity_check__'); // cheap request to confirm it actually works
            redisClient = wrapUpstashRestClient(upstashClient);
            console.log('Redis client connected (Upstash REST mode)');
            return;
        } catch (err) {
            console.error('Failed to initialize Upstash REST client, falling back to TCP:', err.message);
            // fall through to the regular TCP client below
        }
    }

    try {
        const tcpClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
        });

        tcpClient.on('error', (err) => {
            console.error('Redis Client Error', err.message);
        });

        tcpClient.on('connect', () => {
            console.log('Redis client connected');
        });

        await tcpClient.connect();
        redisClient = tcpClient;
    } catch (err) {
        console.error('Failed to initialize Redis:', err);
    }
};

const getRedisClient = () => {
    if (!redisClient) {
        console.warn('Redis client is not initialized yet');
    }
    return redisClient;
};

module.exports = {
    initializeRedis,
    getRedisClient
};
