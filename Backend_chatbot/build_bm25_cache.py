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
import time
from collections import Counter
from txt_processor import TXTStructureParser


# Chunk size used for user uploads. Matches the /upload-pdf ingestion settings so
# BM25 and the Pinecone 'uploads' namespace stay consistent: small chunks keep a
# rare term (a neologism, a name, a date) concentrated enough to be retrievable
# instead of diluted across 400 words of unrelated text.
UPLOAD_CHUNK_SIZE = 180
UPLOAD_CHUNK_OVERLAP = 40
UPLOAD_SOURCE_DIR = "pdfs"
TXT_DIR = os.path.join("data", "txts")


def _atomic_json_dump(data, target_path: str):
    """
    Safely write data to a temporary file, flush to disk, and atomically
    replace the target file. Guarantees the destination is never corrupted.
    """
    dir_name = os.path.dirname(target_path) or "."
    os.makedirs(dir_name, exist_ok=True)
    tmp_path = f"{target_path}.tmp_{os.getpid()}_{int(time.time() * 1000)}"
    try:
        with open(tmp_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp_path, target_path)
    except Exception:
        if os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except OSError:
                pass
        raise


def _uploaded_stems() -> set:
    """
    Stems of documents the user uploaded (as opposed to the bulk corpus).

    A document counts as uploaded when it sits in the top-level pdfs/ directory
    or in a document-scoped subdirectory pdfs/<document_id>/ —
    the same rule PDFChatbot._load_uploaded_docs() uses for trusted content.
    """
    stems = set()
    if not os.path.isdir(UPLOAD_SOURCE_DIR):
        return stems
    for fn in os.listdir(UPLOAD_SOURCE_DIR):
        if fn.startswith("~$") or fn.startswith("."):
            continue
        full_path = os.path.join(UPLOAD_SOURCE_DIR, fn)
        if os.path.isdir(full_path):
            for sub_fn in os.listdir(full_path):
                if sub_fn.startswith("~$") or sub_fn.startswith("."):
                    continue
                if sub_fn.lower().endswith((".pdf", ".docx")):
                    sub_stem = os.path.splitext(sub_fn)[0]
                    stems.add(f"{fn}_{sub_stem}")
        elif fn.lower().endswith((".pdf", ".docx")):
            stems.add(os.path.splitext(fn)[0])
    return stems


def _build_upload_chunks(parser) -> list:
    """Chunk every uploaded document's own .txt with correct source attribution."""
    out = []
    for stem in sorted(_uploaded_stems()):
        txt_file = os.path.join(TXT_DIR, f"{stem}.txt")
        if not os.path.exists(txt_file):
            continue
        try:
            sections = parser.parse_txt_file(txt_file)
            chunks = parser.create_chunks(
                sections, chunk_size=UPLOAD_CHUNK_SIZE, overlap=UPLOAD_CHUNK_OVERLAP
            )
        except Exception as e:
            print(f"⚠️  Could not index uploaded document '{stem}': {e}")
            continue

        safe = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_") or "doc"
        for n, ch in enumerate(chunks):
            md = dict(ch.get("metadata") or {})
            md["source_file"] = f"{stem}.txt"     # real origin, not combined_book.txt
            md["is_upload"] = True
            out.append({
                "id": f"up_{safe}_bm25_{n}",
                "text": ch["text"],
                "metadata": md,
            })
        if chunks:
            print(f"   📎 Indexed upload '{stem}' → {len(chunks)} BM25 chunks")
    return out


def get_or_build_base_corpus(
    txt_path: str = "data/txts/combined_book.txt",
    base_cache_path: str = "data/bm25_base_corpus.json",
    chunk_size: int = 400,
    overlap: int = 50,
    force_rebuild: bool = False,
) -> list:
    """
    Load pre-chunked base corpus if available; otherwise parse combined_book.txt,
    chunk it, and save the base corpus atomically.
    """
    if not force_rebuild and os.path.exists(base_cache_path):
        t0 = time.perf_counter()
        try:
            with open(base_cache_path, "r", encoding="utf-8") as f:
                base_docs = json.load(f)
            t_load = (time.perf_counter() - t0) * 1000
            print(f"⚡ [BM25 Base] Loaded cached base corpus ({len(base_docs)} docs) in {t_load:.1f}ms from {base_cache_path}")
            return base_docs
        except Exception as e:
            print(f"⚠️ [BM25 Base] Corrupted base cache at {base_cache_path} ({e}), regenerating...")

    print(f"📖 [BM25 Base] Parsing static base corpus from {txt_path}...")
    t0 = time.perf_counter()
    parser = TXTStructureParser()
    sections = parser.parse_txt_file(txt_path)
    chunks = parser.create_chunks(sections, chunk_size=chunk_size, overlap=overlap)

    base_docs = []
    for chunk in chunks:
        base_docs.append({
            "id": chunk["id"],
            "text": chunk["text"],
            "metadata": chunk["metadata"],
        })

    _atomic_json_dump(base_docs, base_cache_path)
    t_build = (time.perf_counter() - t0) * 1000
    size_mb = os.path.getsize(base_cache_path) / (1024 * 1024)
    print(f"✅ [BM25 Base] Saved base corpus: {base_cache_path} ({len(base_docs)} docs, {size_mb:.1f} MB) in {t_build:.1f}ms")
    return base_docs


def build_cache(
    txt_path: str = "data/txts/combined_book.txt",
    bm25_output: str = "data/bm25_corpus.json",
    spell_output: str = "data/spell_vocab.json",
    chunk_size: int = 400,
    overlap: int = 50,
    base_cache_path: str = None,
    force_rebuild_base: bool = False,
    rebuild_spell: bool = False,
):
    """
    Build BM25 corpus and optionally rebuild spell vocabulary.

    Optimized Phase 2 workflow:
    - Reuses data/bm25_base_corpus.json (13,239 base chunks) avoiding the 12s regex parsing.
    - Chunks only user-uploaded documents from pdfs/.
    - Combines base + upload chunks and atomically updates bm25_output.
    - Skips spell vocabulary rebuild on upload ingestion (preserved static vocabulary).
    """
    if base_cache_path is None:
        dir_name = os.path.dirname(bm25_output) or "."
        base_name = os.path.basename(bm25_output)
        stem, ext = os.path.splitext(base_name)
        base_stem = stem.replace("corpus", "base_corpus") if "corpus" in stem else f"{stem}_base"
        base_cache_path = os.path.join(dir_name, f"{base_stem}{ext}")

    # 1. Base chunks (cached or built once)
    base_docs = get_or_build_base_corpus(
        txt_path=txt_path,
        base_cache_path=base_cache_path,
        chunk_size=chunk_size,
        overlap=overlap,
        force_rebuild=force_rebuild_base,
    )

    # 2. Upload chunks (parsed from pdfs/ via each document's .txt)
    parser = TXTStructureParser()
    upload_chunks = _build_upload_chunks(parser)

    # 3. Combine base + uploads (preserving ordering semantics)
    bm25_docs = list(base_docs)
    bm25_docs.extend(upload_chunks)

    # 4. Atomic write of complete active corpus
    _atomic_json_dump(bm25_docs, bm25_output)
    size_mb = os.path.getsize(bm25_output) / (1024 * 1024)
    print(f"✅ BM25 corpus saved: {bm25_output} ({len(bm25_docs)} docs [{len(base_docs)} base + {len(upload_chunks)} uploads], {size_mb:.1f} MB)")

    # 5. Spell vocabulary (rebuilt only when missing or explicitly requested)
    vocab_len = 0
    if rebuild_spell or not os.path.exists(spell_output):
        print(f"\n🔨 Building spell vocabulary from {txt_path}...")
        with open(txt_path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read()

        words = content.lower().split()
        word_counts = Counter(w for w in words if w.isalpha() and len(w) > 3)

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

        domain_terms = [word for word, count in word_counts.items()
                        if count >= 3 and len(word) > 7 and word not in noise]
        vocab.extend(domain_terms)
        vocab = sorted(set(vocab))

        _atomic_json_dump(vocab, spell_output)
        print(f"✅ Spell vocabulary saved: {spell_output} ({len(vocab)} terms)")
        vocab_len = len(vocab)
    else:
        print(f"ℹ️  Preserving existing spell vocabulary: {spell_output}")

    return len(bm25_docs), vocab_len


if __name__ == "__main__":
    import argparse
    cli_parser = argparse.ArgumentParser(description="Build BM25 corpus cache + spell vocabulary")
    cli_parser.add_argument("--rebuild-base", action="store_true", help="Force re-parsing combined_book.txt to rebuild base corpus")
    cli_parser.add_argument("--rebuild-spell", action="store_true", help="Force rebuilding spell vocabulary")
    args = cli_parser.parse_args()
    build_cache(
        force_rebuild_base=args.rebuild_base,
        rebuild_spell=args.rebuild_spell or not os.path.exists("data/spell_vocab.json"),
    )
