const redis = require('redis');

let redisClient = null;

const initializeRedis = async () => {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379',
            // Force IPv4: Node sometimes tries IPv6 first when resolving a
            // hosted Redis provider's hostname, and if the container's IPv6
            // networking is broken/unavailable (common in Docker), the
            // connection just hangs until it times out instead of falling
            // back to IPv4 quickly. Python's redis client didn't hit this
            // (it connected fine to the same host/port from the same
            // container), which is what pointed at this being IP-family
            // related rather than a network/firewall block.
            socket: { family: 4 },
        });

        redisClient.on('error', (err) => {
            console.error('Redis Client Error', err);
        });

        redisClient.on('connect', () => {
            console.log('Redis client connected');
        });

        await redisClient.connect();
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
