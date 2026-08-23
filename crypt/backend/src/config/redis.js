const redis = require('redis');
const dns = require('dns');
const { URL } = require('url');

let redisClient = null;

const initializeRedis = async () => {
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

    // TEMPORARY DIAGNOSTIC: log what this specific container actually
    // resolves the Redis hostname to (both address families), since a
    // generic "Connection timeout" alone doesn't say whether DNS resolution,
    // routing, or something else is the actual failure point. Safe to
    // remove once the real cause is found.
    try {
        const { hostname } = new URL(redisUrl);
        if (hostname && hostname !== 'localhost') {
            const addresses = await dns.promises.lookup(hostname, { all: true });
            console.log(`[redis-diag] DNS lookup for ${hostname}:`, JSON.stringify(addresses));
        }
    } catch (dnsErr) {
        console.error('[redis-diag] DNS lookup failed:', dnsErr.code || dnsErr.message);
    }

    try {
        redisClient = redis.createClient({
            url: redisUrl,
            // Force IPv4: Node sometimes tries IPv6 first when resolving a
            // hosted Redis provider's hostname, and if the container's IPv6
            // networking is broken/unavailable (common in Docker), the
            // connection just hangs until it times out instead of falling
            // back to IPv4 quickly. Python's redis client didn't hit this
            // (it connected fine to the same host/port from the same
            // container), which is what pointed at this being IP-family
            // related rather than a network/firewall block.
            socket: { family: 4, connectTimeout: 10000 },
        });

        redisClient.on('error', (err) => {
            // TEMPORARY: log the full error, not just the message — the
            // generic ConnectionTimeoutError string hides the actual
            // underlying code/errno/address that would explain why.
            console.error('[redis-diag] Redis Client Error:', {
                message: err.message,
                code: err.code,
                errno: err.errno,
                address: err.address,
                port: err.port,
                syscall: err.syscall,
                cause: err.cause ? { message: err.cause.message, code: err.cause.code } : undefined,
            });
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
