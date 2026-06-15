const redis = require('redis');

let redisClient = null;

const initializeRedis = async () => {
    try {
        redisClient = redis.createClient({
            url: process.env.REDIS_URL || 'redis://localhost:6379'
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
