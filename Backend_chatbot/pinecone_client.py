import os
import hashlib
from typing import List, Dict, Any
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


class PineconeClient:
    def __init__(self, index_name: str = "pdf-knowledge-base"):
        # FIX for Issue #7: Validate API key before proceeding
        self.api_key = os.getenv("PINECONE_API_KEY")
        if not self.api_key:
            raise ValueError(
                "PINECONE_API_KEY not found in environment variables. "
                "Please set it in your .env file."
            )
        
        self.index_name = index_name
        self.embedding_model = SentenceTransformer('all-MiniLM-L6-v2')
        
        from pinecone import Pinecone, ServerlessSpec
        
        # Initialize Pinecone client
        self.pc = Pinecone(api_key=self.api_key)
        
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
        
        # Connect to the index
        self.index = self.pc.Index(index_name)
    
    def create_embeddings(self, texts: List[str]) -> List[List[float]]:
        """Create embeddings for texts"""
        embeddings = self.embedding_model.encode(texts)
        return embeddings.tolist()

    def create_embedding_single(self, text: str) -> List[float]:
        """Create embedding for a single text, with LRU cache."""
        return list(self._cached_encode(text))

    @lru_cache(maxsize=256)
    def _cached_encode(self, text: str) -> tuple:
        """LRU-cached embedding — avoids re-encoding identical queries."""
        return tuple(self.embedding_model.encode([text])[0].tolist())

    def create_embeddings_batch(self, texts: List[str]) -> List[List[float]]:
        """Batch-encode multiple texts in one call (faster than encoding one-by-one)."""
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
        
        all_matches = []
        for ns in namespaces:
            try:
                results = self.index.query(
                    vector=query_embedding,
                    top_k=top_k,
                    include_metadata=True,
                    namespace=ns
                )
                all_matches.extend(results.get('matches', []))
            except Exception as e:
                print(f"⚠️  [Search] Failed to query namespace '{ns}': {e}")
                
        # Sort combined matches by score descending and take top_k
        all_matches.sort(key=lambda x: x.get('score', 0.0), reverse=True)
        return all_matches[:top_k]

    def search_with_vector(self, vector: List[float], top_k: int = 5, namespaces: List[str] = ["", "uploads"]) -> List[Dict]:
        """Search using a pre-computed embedding vector across multiple namespaces."""
        all_matches = []
        for ns in namespaces:
            try:
                results = self.index.query(
                    vector=vector,
                    top_k=top_k,
                    include_metadata=True,
                    namespace=ns
                )
                all_matches.extend(results.get('matches', []))
            except Exception as e:
                print(f"⚠️  [Search] Failed to query namespace '{ns}': {e}")
                
        # Sort combined matches by score descending and take top_k
        all_matches.sort(key=lambda x: x.get('score', 0.0), reverse=True)
        return all_matches[:top_k]
