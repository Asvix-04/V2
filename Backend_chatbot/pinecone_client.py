import os
import hashlib
import threading
from typing import List, Dict, Any, Optional
from functools import lru_cache
from sentence_transformers import SentenceTransformer
from dotenv import load_dotenv

load_dotenv()


def _deterministic_hash(value: str) -> str:
    """Deterministic hash that is stable across Python processes and restarts.
    
    FIX for Issue #4: Python's built-in hash() is randomized per process
    (PYTHONHASHSEED), so neo4j_id generated during ingestion won't match
    the IDs looked up during retrieval. Using SHA-256 truncated to 12 hex chars.
    """
    return hashlib.sha256(value.encode('utf-8')).hexdigest()[:12]


# ─────────────────────────────────────────────────────────────
# Process-Level Shared Embedding Model & Synchronization Locks
# ─────────────────────────────────────────────────────────────

_SHARED_EMBEDDING_MODEL: Optional[SentenceTransformer] = None
_MODEL_INIT_LOCK = threading.Lock()
_MODEL_INFERENCE_LOCK = threading.Lock()


def get_shared_embedding_model() -> SentenceTransformer:
    """Lazily load and return the process-level shared SentenceTransformer instance.

    Thread-safe double-checked locking ensures only one model is loaded per process,
    eliminating the ~6-11 second initialization cost on repeated usages.
    """
    global _SHARED_EMBEDDING_MODEL
    if _SHARED_EMBEDDING_MODEL is None:
        with _MODEL_INIT_LOCK:
            if _SHARED_EMBEDDING_MODEL is None:
                _SHARED_EMBEDDING_MODEL = SentenceTransformer('all-MiniLM-L6-v2')
    return _SHARED_EMBEDDING_MODEL


# ─────────────────────────────────────────────────────────────
# Process-Level Shared Pinecone Index Cache
# ─────────────────────────────────────────────────────────────

_INDEX_CACHE: Dict[str, Any] = {}
_INDEX_CACHE_LOCK = threading.Lock()


def get_shared_pinecone_index(
    index_name: str = "pdf-knowledge-base",
    api_key: Optional[str] = None,
    pinecone_client: Optional[Any] = None,
) -> Any:
    """Return a process-level cached Pinecone Index object for index_name.

    Thread-safe double-checked locking ensures index host resolution (~2.5s)
    only happens once per index_name across the lifetime of the process.
    """
    global _INDEX_CACHE
    if index_name in _INDEX_CACHE:
        return _INDEX_CACHE[index_name]

    with _INDEX_CACHE_LOCK:
        if index_name not in _INDEX_CACHE:
            if pinecone_client is not None:
                _INDEX_CACHE[index_name] = pinecone_client.Index(index_name)
            else:
                key = api_key or os.getenv("PINECONE_API_KEY")
                if not key:
                    raise ValueError(
                        "PINECONE_API_KEY not found in environment variables. "
                        "Please set it in your .env file."
                    )
                from pinecone import Pinecone
                pc = Pinecone(api_key=key, connection_pool_maxsize=120)
                _INDEX_CACHE[index_name] = pc.Index(index_name)
    return _INDEX_CACHE[index_name]


def extract_vector_ids_from_list_response(pages_iterable: Any) -> List[str]:
    """Extract vector ID strings from Pinecone index.list() generator or pages.

    Handles Pinecone SDK v5+ ListResponse objects (where page.vectors contains ListItem objects),
    plain lists of IDs, or generic iterables.
    """
    vector_ids: List[str] = []
    if pages_iterable is None:
        return vector_ids

    for page in pages_iterable:
        if hasattr(page, "vectors") and page.vectors is not None:
            vector_ids.extend([v.id for v in page.vectors if hasattr(v, "id")])
        elif isinstance(page, list):
            vector_ids.extend([v.id if hasattr(v, "id") else str(v) for v in page])
        elif hasattr(page, "__iter__") and not isinstance(page, (str, bytes)):
            for item in page:
                if hasattr(item, "id"):
                    vector_ids.append(item.id)
                elif isinstance(item, str):
                    vector_ids.append(item)
        elif isinstance(page, str):
            vector_ids.append(page)
    return vector_ids


class PineconeClient:
    def __init__(
        self,
        index_name: str = "pdf-knowledge-base",
        embedding_model: Optional[Any] = None,
        skip_index_check: bool = False,
    ):
        # FIX for Issue #7: Validate API key before proceeding
        self.api_key = os.getenv("PINECONE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "PINECONE_API_KEY not found in environment variables. "
                "Please set it in your .env file."
            )
        
        self.index_name = index_name
        if embedding_model is not None:
            self.embedding_model = embedding_model
        else:
            self.embedding_model = get_shared_embedding_model()
        
        from pinecone import Pinecone, ServerlessSpec
        
        # Initialize Pinecone client
        self.pc = Pinecone(api_key=self.api_key, connection_pool_maxsize=120)
        
        if not skip_index_check:
            # Create index if it doesn't exist
            existing_indexes = [index.name for index in self.pc.list_indexes()]

            if index_name not in existing_indexes:
                print(f"Creating index: {index_name}")
                self.pc.create_index(
                    name=index_name,
                    dimension=384,  # Dimension of all-MiniLM-L6-v2
                    metric="cosine",
                    spec=ServerlessSpec(
                        cloud="aws",
                        region=os.getenv("PINECONE_ENVIRONMENT", "us-east-1")
                    )
                )
        
        # Connect to the index using the process-level cache
        self.index = get_shared_pinecone_index(
            index_name,
            api_key=self.api_key,
            pinecone_client=self.pc,
        )
    
    def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Create embeddings for texts"""
        with _MODEL_INFERENCE_LOCK:
            embeddings = self.embedding_model.encode(texts)
        return embeddings.tolist()

    def create_embedding_single(self, text: str) -> List[float]:
        """Create embedding for a single text, with LRU cache."""
        return list(self._cached_encode(text))

    @lru_cache(maxsize=256)
    def _cached_encode(self, text: str) -> tuple:
        """LRU-cached embedding — avoids re-encoding identical queries."""
        with _MODEL_INFERENCE_LOCK:
            embeddings = self.embedding_model.encode([text])
        return tuple(embeddings[0].tolist())

    def create_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Batch-encode multiple texts in one call (faster than encoding one-by-one)."""
        with _MODEL_INFERENCE_LOCK:
            embeddings = self.embedding_model.encode(texts)
        return embeddings.tolist()
    
    def upsert_chunks(self, chunks: List[Any], namespace: str = "", progress_callback=None) -> None:
        """
        Upsert document chunks to Pinecone.

        Encodes all chunk texts in large batches (ENCODE_BATCH=256) using a
        single SentenceTransformer call per batch — ~10x faster than the old
        one-at-a-time approach for large corpora.

        Args:
            chunks: List of chunk objects with chunk_id, text, metadata, section_path
            progress_callback: Optional callable(upserted_so_far: int) for live progress
        """
        if not chunks:
            print("⚠️  upsert_chunks called with empty list — nothing to do.")
            return

        ENCODE_BATCH = 256   # SentenceTransformer encodes this many texts per call
        UPSERT_BATCH = 100   # Pinecone accepts up to 100 vectors per upsert call

        # ── Step 1: Batch-encode all texts ──────────────────────────────────
        texts = [c.text for c in chunks]
        print(f"⚡ Encoding {len(texts)} chunks in batches of {ENCODE_BATCH}...")
        all_embeddings: List[List[float]] = []
        for i in range(0, len(texts), ENCODE_BATCH):
            batch_texts = texts[i: i + ENCODE_BATCH]
            with _MODEL_INFERENCE_LOCK:
                batch_emb = self.embedding_model.encode(batch_texts, show_progress_bar=False)
            all_embeddings.extend(batch_emb.tolist())
            print(f"   Encoded {min(i + ENCODE_BATCH, len(texts))}/{len(texts)} chunks", end="\r")
        print(f"\n✅ Encoding complete — {len(all_embeddings)} embeddings ready")

        # ── Step 2: Build Pinecone vector dicts ─────────────────────────────
        vectors = []
        for chunk, embedding in zip(chunks, all_embeddings):
            # FIX for Issue #4: Use deterministic hash instead of Python hash()
            section_path_str = ' > '.join(chunk.section_path)
            neo4j_id = f"section_{_deterministic_hash(section_path_str)}"

            vectors.append({
                'id': chunk.chunk_id,
                'values': embedding,
                'metadata': {
                    **chunk.metadata,
                    # 1500 chars gives the LLM several paragraphs of context per chunk
                    'text': chunk.text[:1500],
                    'neo4j_id': neo4j_id,
                    'type': 'document_chunk',
                }
            })

        # ── Step 3: Upsert in batches, report progress ───────────────────────
        upserted = 0
        for i in range(0, len(vectors), UPSERT_BATCH):
            batch = vectors[i: i + UPSERT_BATCH]
            self.index.upsert(vectors=batch, namespace=namespace)
            upserted += len(batch)
            if progress_callback:
                progress_callback(upserted)
            print(f"   Upserted {upserted}/{len(vectors)} vectors to Pinecone", end="\r")

        print(f"\n✅ Upserted {upserted} vectors to Pinecone")
    
    def search(self, query: str, top_k: int = 5, namespaces: List[str] = ["", "uploads"]) -> List[Dict]:
        """Search for similar chunks across multiple namespaces (with LRU-cached embedding)"""
        query_embedding = self.create_embedding_single(query)

        per_ns: Dict[str, List[Dict]] = {}
        for ns in namespaces:
            try:
                results = self.index.query(
                    vector=query_embedding,
                    top_k=top_k,
                    include_metadata=True,
                    namespace=ns,
                    filter={"type": "document_chunk"}
                )
                per_ns[ns] = list(results.get('matches', []))
            except Exception as e:
                print(f"⚠️  [Search] Failed to query namespace '{ns}': {e}")
                per_ns[ns] = []

        # Same upload-aware merge as search_with_vector().
        return self._merge_namespace_matches(per_ns, top_k)

    # How many result slots are guaranteed to user-uploaded content when the
    # 'uploads' namespace has any hit at all. See _merge_namespace_matches().
    UPLOAD_RESERVED_SLOTS = 2

    def _merge_namespace_matches(self, per_ns: Dict[str, List[Dict]], top_k: int) -> List[Dict]:
        """
        Merge per-namespace matches, guaranteeing uploaded documents a foothold.

        A plain "merge everything, sort by score, truncate" loses user uploads:
        the default namespace holds tens of thousands of bulk-corpus vectors
        while 'uploads' holds a handful, so the bulk corpus fills every slot even
        when it beats the uploaded document by a hair. The user then asks about
        the document they just uploaded and is answered from the bulk corpus.

        We therefore reserve up to UPLOAD_RESERVED_SLOTS for non-default
        namespaces, then fill the rest by score. Ranking itself is unchanged —
        this only ensures uploaded chunks reach the RRF fusion stage as
        candidates instead of being dropped before it.
        """
        default_matches = per_ns.get("", [])
        upload_matches = [m for ns, ms in per_ns.items() if ns for m in ms]
        upload_matches.sort(key=lambda x: x.get("score", 0.0), reverse=True)

        reserved = upload_matches[:self.UPLOAD_RESERVED_SLOTS] if upload_matches else []
        reserved_ids = {m.get("id") for m in reserved}

        rest = [m for m in (default_matches + upload_matches)
                if m.get("id") not in reserved_ids]
        rest.sort(key=lambda x: x.get("score", 0.0), reverse=True)

        merged = reserved + rest
        merged.sort(key=lambda x: x.get("score", 0.0), reverse=True)

        # Guarantee the reserved uploads survive the truncation.
        out = merged[:top_k]
        if reserved:
            missing = [m for m in reserved if m not in out]
            if missing:
                out = (out[:max(0, top_k - len(missing))] + missing)
        return out[:top_k]

    def search_with_vector(self, vector: List[float], top_k: int = 5, namespaces: List[str] = ["", "uploads"]) -> List[Dict]:
        """Search using a pre-computed embedding vector across multiple namespaces."""
        per_ns: Dict[str, List[Dict]] = {}
        for ns in namespaces:
            try:
                results = self.index.query(
                    vector=vector,
                    top_k=top_k,
                    include_metadata=True,
                    namespace=ns,
                    filter={"type": "document_chunk"}
                )
                per_ns[ns] = list(results.get('matches', []))
            except Exception as e:
                print(f"⚠️  [Search] Failed to query namespace '{ns}': {e}")
                per_ns[ns] = []

        return self._merge_namespace_matches(per_ns, top_k)

    def upsert_semantic_cache(self, question: str, redis_hash: str, namespace: str = "semantic_cache") -> None:
        """Upsert a question embedding to the semantic cache with a reference to the Redis hash."""
        embedding = self.create_embedding_single(question)
        vector_id = f"cache_{_deterministic_hash(question)}"
        
        self.index.upsert(
            vectors=[{
                'id': vector_id,
                'values': embedding,
                'metadata': {
                    'text': question,
                    'redis_hash': redis_hash,
                    'type': 'semantic_cache'
                }
            }],
            namespace=namespace
        )
        print(f"✅ [Cache] Upserted semantic cache vector for query: {question[:30]}...")

    def search_semantic_cache(self, query: str, threshold: float = 0.95, namespace: str = "semantic_cache", precomputed_embedding: Optional[List[float]] = None) -> Optional[str]:
        """Search the semantic cache for a similar question. Returns the Redis hash if found."""
        if precomputed_embedding is not None:
            query_embedding = precomputed_embedding
        else:
            query_embedding = self.create_embedding_single(query)
        try:
            results = self.index.query(
                vector=query_embedding,
                top_k=1,
                include_metadata=True,
                namespace=namespace,
                filter={"type": "semantic_cache"}
            )
            
            if results.get('matches') and len(results['matches']) > 0:
                best_match = results['matches'][0]
                if best_match.get('score', 0.0) >= threshold:
                    print(f"✅ [Cache] Semantic cache hit! Score: {best_match.get('score')} for: {query[:30]}...")
                    return best_match['metadata'].get('redis_hash')
        except Exception as e:
            print(f"⚠️  [Cache] Semantic cache search failed: {e}")
            
        return None
