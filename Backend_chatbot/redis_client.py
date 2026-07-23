import os
import json
import hashlib
from typing import Dict, Any, Optional

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


class LocalMemoryCache:
    """Graceful local fallback if Redis server is down."""
    def __init__(self):
        self._cache: Dict[str, Any] = {}

    def get(self, key: str) -> Optional[str]:
        return self._cache.get(key)

    def setex(self, key: str, time: int, value: str) -> None:
        self._cache[key] = value

    def set(self, key: str, value: str) -> None:
        self._cache[key] = value


class RedisManager:
    """Centralized cache manager for Global Response Caching and session memory."""
    def __init__(self, host: str = "localhost", port: int = 6379, db: int = 0, default_ttl: int = 86400):
        self.default_ttl = default_ttl  # Default 24 hours
        
        self.use_local = True
        self.client = None
        
        redis_host = os.getenv("REDIS_HOST", host)
        redis_port = int(os.getenv("REDIS_PORT", port))
        
        if REDIS_AVAILABLE:
            try:
                self.client = redis.Redis(host=redis_host, port=redis_port, db=db, decode_responses=True)
                self.client.ping()
                self.use_local = False
                print(f"✅ Connected to Redis cache at {redis_host}:{redis_port}")
            except (redis.ConnectionError, redis.TimeoutError) as e:
                print(f"⚠️ Redis unavailable at {redis_host}:{redis_port}, falling back to LocalMemoryCache")
                self.client = LocalMemoryCache()
        else:
            print("⚠️ Redis python package not found, falling back to LocalMemoryCache")
            self.client = LocalMemoryCache()

    @staticmethod
    def get_hash_key(question: str) -> str:
        """Normalized Hashing: lowercased, stripped, SHA256 hashed."""
        clean_q = " ".join(question.lower().split())
        return f"cache:response:{hashlib.sha256(clean_q.encode('utf-8')).hexdigest()}"
        
    def get_exact_match(self, question: str) -> Optional[Dict[str, Any]]:
        """Hook 1: Exact Match Hook - Retrieve cached response based on the question text."""
        key = self.get_hash_key(question)
        data = self.client.get(key)
        if data:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return None
        return None

    def get_by_hash(self, redis_hash: str) -> Optional[Dict[str, Any]]:
        """Retrieve a cached response directly by its hash key (used by Semantic Fallback)."""
        data = self.client.get(redis_hash)
        if data:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return None
        return None

    def save_response(self, question: str, response_data: Dict[str, Any]) -> str:
        """Hook 4: Success-Only Saving - Store rich metadata JSON object."""
        key = self.get_hash_key(question)
        self.client.setex(key, self.default_ttl, json.dumps(response_data))
        return key
        
    def get_session_history(self, session_id: str) -> Optional[list]:
        """Global Session Memory: Retrieve chat history for load-balanced continuity."""
        key = f"session:{session_id}"
        data = self.client.get(key)
        if data:
            try:
                return json.loads(data)
            except json.JSONDecodeError:
                return None
        return None
        
    def save_session_history(self, session_id: str, history: list) -> None:
        """Global Session Memory: Save chat history to Redis."""
        key = f"session:{session_id}"
        self.client.setex(key, self.default_ttl, json.dumps(history))

# Singleton instance
redis_client = RedisManager()
