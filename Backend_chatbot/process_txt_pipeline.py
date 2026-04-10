import os
from dotenv import load_dotenv
from txt_processor import TXTStructureParser
from neo4j_txt_builder import TXTNeo4jBuilder
from pinecone_client import PineconeClient

load_dotenv()

def process_txt_file(txt_path: str):
    """Complete pipeline for TXT file"""
    print(f"Processing TXT file: {txt_path}")
    
    if not os.path.exists(txt_path):
        print(f"Error: File not found at {txt_path}")
        return
    
    # 1. Parse TXT structure
    parser = TXTStructureParser()
    sections = parser.parse_txt_file(txt_path)
    
    # Display sample
    print("\nSample sections parsed:")
    for i, section in enumerate(sections[:5]):
        print(f"{i+1}. [Level {section.level}] {section.title}")
        print(f"   Path: {' > '.join(section.section_path)}")
        print(f"   Content: {section.content[:100]}...")
        print()
    
    # 2. Build Neo4j graph
    print("Building Neo4j knowledge graph...")
    try:
        neo4j = TXTNeo4jBuilder(
            uri=os.getenv("NEO4J_URI"),
            user=os.getenv("NEO4J_USERNAME"),
            password=os.getenv("NEO4J_PASSWORD")
        )
        neo4j.build_graph_from_sections(sections)
        neo4j.close()
        print("✅ Neo4j graph built successfully")
    except Exception as e:
        print(f"⚠️  Warning: Could not connect to Neo4j. Skipping graph builder. Error: {e}")
        print("   (Vector search in Pinecone will still function normally)")
    
    # 3. Create chunks for Pinecone
    print("Creating vector embeddings...")
    chunks = parser.create_chunks(sections)
    
    # 4. Upload to Pinecone
    pinecone = PineconeClient()
    
    # Convert chunks to format Pinecone expects
    from dataclasses import dataclass
    
    @dataclass
    class PineconeChunk:
        chunk_id: str
        text: str
        metadata: dict
        section_path: list
    
    pinecone_chunks = []
    for chunk in chunks:
        pc_chunk = PineconeChunk(
            chunk_id=chunk['id'],
            text=chunk['text'],
            metadata=chunk['metadata'],
            section_path=chunk['section_path']
        )
        pinecone_chunks.append(pc_chunk)
    
    pinecone.upsert_chunks(pinecone_chunks)
    
    # 5. Save processing flag
    os.makedirs("data/processed", exist_ok=True)
    with open("data/processed/txt_processed.flag", "w") as f:
        f.write("processed")
    
    print("\n" + "="*60)
    print("✅ TXT Processing Complete!")
    print(f"   - Parsed {len(sections)} hierarchical sections")
    print(f"   - Created {len(chunks)} vector chunks")
    print("="*60)

if __name__ == "__main__":
    # Update this path to your TXT file
    txt_file = "data/txts/combined_book.txt"  # ← CHANGE THIS!
    process_txt_file(txt_file)