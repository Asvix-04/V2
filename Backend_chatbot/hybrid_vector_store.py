from typing import List, Dict, Any
from pinecone_client import PineconeClient

class HybridVectorStore:
    """Vector search using Pinecone only"""
    
    def __init__(self):
        self.pinecone_client = None
        
        try:
            self.pinecone_client = PineconeClient()
            print("✅ Pinecone initialized")
        except Exception as e:
            print(f"⚠️  Pinecone failed: {e}")
            self.pinecone_client = None
    
    def add_chunks(self, chunks: List[Any]) -> None:
        """Add chunks to Pinecone"""
        if self.pinecone_client:
            try:
                self.pinecone_client.upsert_chunks(chunks)
            except Exception as e:
                print(f"❌ Pinecone upsert failed: {e}")
        else:
            print("❌ Pinecone not available")
    
    def search(
        self, 
        query: str, 
        top_k: int = 5
    ) -> List[Dict]:
        """Search using Pinecone"""
        if self.pinecone_client:
            try:
                results = self.pinecone_client.search(query, top_k)
                print("✅ Results from Pinecone")
                return results
            except Exception as e:
                print(f"❌ Pinecone search failed: {e}")
        
        return []
    
    def get_status(self) -> Dict[str, Any]:
        """Get Pinecone status"""
        return {
            'pinecone': 'active' if self.pinecone_client else 'inactive',
        }
