"""
Ingest the second (journal-article) corpus into its own Pinecone index +
BM25 cache, so Gemini 2.5 Pro can be routed to it independently of Gemini
2.5 Flash's existing "pdf-knowledge-base" index (see llm_client.ModelConfig).

Usage:
    python ingest_v2_corpus.py

Outputs:
    Pinecone index "pdf-knowledge-base-v2" — populated with vectors
    data/bm25_corpus_v2.json — BM25 keyword index matching the same chunks
"""
import os
import json
from dataclasses import dataclass
from dotenv import load_dotenv
from txt_processor import TXTStructureParser
from source_corpus_parser import parse_source_divided_file
from pinecone_client import PineconeClient

load_dotenv()


@dataclass
class PineconeChunk:
    chunk_id: str
    text: str
    metadata: dict
    section_path: list


def ingest(
    txt_path: str = "data/txts/combined_book_v2.txt",
    index_name: str = "pdf-knowledge-base-v2",
    bm25_output: str = "data/bm25_corpus_v2.json",
):
    if not os.path.exists(txt_path):
        print(f"Error: file not found at {txt_path}")
        return

    print(f"Parsing source-divided corpus: {txt_path}")
    sections = parse_source_divided_file(txt_path)

    print(f"\nChunking {len(sections)} articles...")
    parser = TXTStructureParser()
    chunks = parser.create_chunks(sections)

    print(f"\nBuilding BM25 cache...")
    bm25_docs = [
        {'id': c['id'], 'text': c['text'], 'metadata': c['metadata']}
        for c in chunks
    ]
    os.makedirs(os.path.dirname(bm25_output) or '.', exist_ok=True)
    with open(bm25_output, 'w', encoding='utf-8') as f:
        json.dump(bm25_docs, f, ensure_ascii=False)
    size_mb = os.path.getsize(bm25_output) / (1024 * 1024)
    print(f"BM25 corpus saved: {bm25_output} ({len(bm25_docs)} docs, {size_mb:.1f} MB)")

    print(f"\nUpserting {len(chunks)} chunks into Pinecone index '{index_name}'...")
    pinecone = PineconeClient(index_name)
    pinecone_chunks = [
        PineconeChunk(
            chunk_id=c['id'],
            text=c['text'],
            metadata=c['metadata'],
            section_path=c['section_path'],
        )
        for c in chunks
    ]
    pinecone.upsert_chunks(pinecone_chunks)

    os.makedirs("data/processed", exist_ok=True)
    with open("data/processed/v2_corpus_processed.flag", "w") as f:
        f.write("processed")

    print("\n" + "=" * 60)
    print("v2 corpus ingestion complete!")
    print(f"   - Parsed {len(sections)} articles")
    print(f"   - Created {len(chunks)} vector chunks")
    print(f"   - Pinecone index: {index_name}")
    print(f"   - BM25 cache: {bm25_output}")
    print("=" * 60)


if __name__ == "__main__":
    ingest()
