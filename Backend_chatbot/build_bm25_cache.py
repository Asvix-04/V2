"""
Build BM25 corpus cache + spell vocabulary from combined_book.txt.

Run this ONCE after processing your PDFs, or whenever combined_book.txt changes.

Usage:
    python build_bm25_cache.py

Outputs:
    data/bm25_corpus.json   — BM25 document index (used by hybrid_retriever)
    data/spell_vocab.json   — Spell correction vocabulary
"""

import os
import json
import re
from collections import Counter
from txt_processor import TXTStructureParser


def build_cache(
    txt_path: str = "data/txts/combined_book.txt",
    bm25_output: str = "data/bm25_corpus.json",
    spell_output: str = "data/spell_vocab.json",
    chunk_size: int = 400,
    overlap: int = 50,
):
    print(f"📖 Reading {txt_path}...")
    
    # Parse sections
    parser = TXTStructureParser()
    sections = parser.parse_txt_file(txt_path)
    
    # Create chunks (same logic as txt_processor.create_chunks)
    chunks = parser.create_chunks(sections, chunk_size=chunk_size, overlap=overlap)
    
    # ── Build BM25 corpus ──
    print(f"\n🔨 Building BM25 corpus from {len(chunks)} chunks...")
    
    bm25_docs = []
    for chunk in chunks:
        bm25_docs.append({
            'id': chunk['id'],
            'text': chunk['text'],
            'metadata': chunk['metadata'],
        })
    
    os.makedirs(os.path.dirname(bm25_output) or '.', exist_ok=True)
    with open(bm25_output, 'w', encoding='utf-8') as f:
        json.dump(bm25_docs, f, ensure_ascii=False)
    
    size_mb = os.path.getsize(bm25_output) / (1024 * 1024)
    print(f"✅ BM25 corpus saved: {bm25_output} ({len(bm25_docs)} docs, {size_mb:.1f} MB)")
    
    # ── Build spell vocabulary ──
    print(f"\n🔨 Building spell vocabulary...")
    
    with open(txt_path, 'r', encoding='utf-8', errors='ignore') as f:
        content = f.read()
    
    # Extract meaningful words from the content
    words = content.lower().split()
    word_counts = Counter(w for w in words if w.isalpha() and len(w) > 3)
    
    # Keep words that appear 5+ times (real course terms, not typos)
    # Filter out ultra-common English words that don't help spell correction
    noise = {
        'this', 'that', 'these', 'there', 'they', 'their', 'which', 'where',
        'when', 'what', 'have', 'been', 'from', 'with', 'about', 'some',
        'will', 'also', 'such', 'each', 'into', 'most', 'many', 'like',
        'more', 'than', 'other', 'your', 'over', 'after', 'before', 'would',
        'could', 'should', 'does', 'make', 'made', 'well', 'very', 'much',
        'only', 'just', 'being', 'both', 'same', 'need', 'used', 'using',
        'however', 'therefore', 'through', 'between', 'because', 'those',
        'different', 'various', 'important', 'called', 'known', 'based',
        'first', 'second', 'third', 'following', 'according', 'shall',
        'discuss', 'explain', 'describe', 'unit', 'block', 'page',
        'check', 'progress', 'answers', 'possible', 'provided', 'below',
        'space', 'further', 'readings', 'learning', 'outcomes', 'structure',
        'introduction', 'note', 'thus', 'hence', 'mentioned', 'given',
        'includes', 'include', 'including', 'related', 'refer', 'refers',
        'example', 'examples', 'case', 'order', 'terms', 'form', 'forms',
        'role', 'help', 'helps', 'allows', 'provides', 'involves',
        'then', 'here', 'itself', 'them', 'were', 'whether', 'while',
        'upon', 'under', 'above', 'still', 'within', 'without', 'during',
    }
    
    vocab = [word for word, count in word_counts.items() 
             if count >= 5 and word not in noise]
    
    # Also add key bigrams as joined terms for better matching
    # e.g., "photojournalism", "daguerreotype", "mediatisation"
    domain_terms = [word for word, count in word_counts.items()
                    if count >= 3 and len(word) > 7 and word not in noise]
    vocab.extend(domain_terms)
    
    vocab = sorted(set(vocab))
    
    with open(spell_output, 'w') as f:
        json.dump(vocab, f)
    
    print(f"✅ Spell vocabulary saved: {spell_output} ({len(vocab)} terms)")
    
    # Show samples
    print(f"\n📋 Sample spell terms: {vocab[:20]}")
    
    return len(bm25_docs), len(vocab)


if __name__ == "__main__":
    build_cache()
