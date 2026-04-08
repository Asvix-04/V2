import os
import hashlib
from typing import List, Dict, Any
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
    
    def upsert_chunks(self, chunks: List[Any]) -> None:
        """Upsert document chunks to Pinecone"""
        vectors = []
        
        for chunk in chunks:
            embedding = self.create_embeddings([chunk.text])[0]
            
            # FIX for Issue #4: Use deterministic hash instead of Python hash()
            section_path_str = ' > '.join(chunk.section_path)
            neo4j_id = f"section_{_deterministic_hash(section_path_str)}"
            
            vector = {
                'id': chunk.chunk_id,
                'values': embedding,
                'metadata': {
                    **chunk.metadata,
                    # Increased from 500 → 1500 chars. Truncating at 500 means the LLM
                    # only gets a sentence or two of context per chunk, causing it to
                    # fill missing content with hallucinated facts.
                    'text': chunk.text[:1500],
                    'neo4j_id': neo4j_id,
                    'type': 'document_chunk'
                }
            }
            vectors.append(vector)
        
        # Upsert in batches
        batch_size = 100
        for i in range(0, len(vectors), batch_size):
            batch = vectors[i:i + batch_size]
            self.index.upsert(vectors=batch)
        
        print(f"Upserted {len(vectors)} vectors to Pinecone")
    
    def search(self, query: str, top_k: int = 5) -> List[Dict]:
        """Search for similar chunks"""
        query_embedding = self.create_embeddings([query])[0]
        
        results = self.index.query(
            vector=query_embedding,
            top_k=top_k,
            include_metadata=True
        )
        
        return results['matches']
