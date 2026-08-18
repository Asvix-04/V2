import os
import json
import hashlib
import threading
import time as _time
from collections import OrderedDict
from typing import Dict, Any, Optional

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False


# Cap on entries held by the in-process fallback cache. Without a bound this store
# grows for every distinct question and session until the process runs out of
# memory (real Redis expires keys on its own; this fallback must do it itself).
LOCAL_CACHE_MAX_ENTRIES = int(os.getenv("LOCAL_CACHE_MAX_ENTRIES", "5000"))
LOCAL_CACHE_DEFAULT_TTL = int(os.getenv("LOCAL_CACHE_DEFAULT_TTL", "86400"))


class LocalMemoryCache:
    """
    Graceful local fallback if Redis server is down.

    Bounded and TTL-aware so it cannot grow without limit:
      - every entry carries an expiry and is dropped once stale,
      - the store is capped at LOCAL_CACHE_MAX_ENTRIES with least-recently-used
        eviction,
      - access is guarded by a lock because background ingestion threads and
        request threads share this object.
    """

    def __init__(self, max_entries: int = LOCAL_CACHE_MAX_ENTRIES):
        self._cache: "OrderedDict[str, tuple]" = OrderedDict()
        self._max_entries = max(1, max_entries)
        self._lock = threading.Lock()

    def _store(self, key: str, value: str, ttl_seconds: Optional[int]) -> None:
        # ttl_seconds None -> never expires; any number -> absolute expiry (a
        # non-positive TTL therefore lands in the past and reads as already stale).
        expires_at = _time.time() + ttl_seconds if ttl_seconds is not None else None
        with self._lock:
            self._cache[key] = (value, expires_at)
            self._cache.move_to_end(key)
            # Drop expired entries first, then evict oldest while over capacity.
            now = _time.time()
            for stale_key in [k for k, (_, exp) in self._cache.items()
                              if exp is not None and exp <= now]:
                self._cache.pop(stale_key, None)
            while len(self._cache) > self._max_entries:
                self._cache.popitem(last=False)

    def get(self, key: str) -> Optional[str]:
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            value, expires_at = entry
            if expires_at is not None and expires_at <= _time.time():
                self._cache.pop(key, None)
                return None
            self._cache.move_to_end(key)
            return value

    def setex(self, key: str, time: int, value: str) -> None:
        # Signature mirrors redis-py's setex(name, time, value).
        self._store(key, value, time)

    def set(self, key: str, value: str) -> None:
        self._store(key, value, LOCAL_CACHE_DEFAULT_TTL)

    def delete(self, key: str) -> None:
        with self._lock:
            self._cache.pop(key, None)


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
