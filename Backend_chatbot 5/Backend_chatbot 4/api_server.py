"""
api_server.py — FastAPI server for Media Literacy Chatbot.

Merged version combining:
- Optimized Speech-to-Speech (Sarvam, Parallel TTS, Rate limiting)
- MySQL Reference Links (Grounded context)
- Explain-Selection logic
- Follow-up Questions generation
"""

from utils import MAX_AUDIO_BYTES, RateLimiter, s2s_limiter
import base64
import binascii
import re
import time
import threading
import shutil
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import uvicorn
from contextlib import asynccontextmanager

from chatbot import PDFChatbot
from sarvam_client import SarvamClient, LANGUAGE_DISPLAY
from metrics_logger import log_request_metrics, get_metrics_summary
from schema.db_schema import check_db_connection
try:
    from Db import find_reference_links, check_db_connection
except ImportError:
    def find_reference_links(*args, **kwargs):
        return []
    def check_db_connection():
        return False
import os
from dotenv import load_dotenv

load_dotenv()

S2S_TIMING_LOG_FILE = "s2s_timing_log.txt"
PDF_UPLOAD_DIR = "pdfs"
MAX_PDF_BYTES = 50 * 1024 * 1024  # 50 MB limit
os.makedirs(PDF_UPLOAD_DIR, exist_ok=True)

# Shared state for background upload job tracking
_upload_status: Dict[str, Any] = {
    "status": "idle",       # idle | processing | done | error
    "filename": None,
    "started_at": None,
    "finished_at": None,
    "pages_processed": 0,
    "chunks_created": 0,
    "vectors_upserted": 0,
    "duration_seconds": None,
    "error": None,
}

# ─────────────────────────────────────────────────────────────
# App Setup
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Media Literacy Chatbot API",
    description="API for the Media Literacy Course Chatbot with reference links",
    version="2.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Replace with your frontend URL in production
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    start_time = time.perf_counter()
    response = await call_next(request)
    process_time = (time.perf_counter() - start_time) * 1000
    response.headers["X-Process-Time"] = str(process_time)
    
    # Generic logging for non-chat endpoints (health, docs, etc.)
    # Chat endpoint will do its own detailed logging
    if not request.url.path.startswith("/chat"):
        log_request_metrics(
            endpoint=request.url.path,
            status_code=response.status_code,
            response_time_ms=process_time
        )
    return response

chatbot = None
sarvam_client = None


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
    model: Optional[str] = None
    use_history: Optional[bool] = True

class SelectionRequest(BaseModel):
    selected_text: str        # The text the user highlighted
    full_bot_message: str     # The full bot answer it came from

class ReferenceLink(BaseModel):
    title: str
    url: str
    relevance_score: float

class ChatResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    expanded_queries: List[str]
    validation: Optional[Dict[str, Any]] = None
    metadata: Optional[Dict[str, Any]] = None
    reference_links: List[ReferenceLink] = []
    follow_up_questions: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    message: str
    chatbot_ready: bool
    speech_ready: bool
    db_connected: bool


class TextToTextRequest(BaseModel):
    question: str
    language_code: Optional[str] = None         # user's language (e.g. "hi-IN")
    use_history: Optional[bool] = True

class TextToTextResponse(BaseModel):
    original_question: str               # question as sent by user
    detected_language: str               # language code echoed back
    detected_language_name: str          # e.g. "Hindi"
    english_question: str                # translated English question
    answer: str                          # final answer in user's language
    sources: List[Dict[str, Any]]
    expanded_queries: List[str]
    validation: Optional[Dict[str, Any]] = None


class SpeechToSpeechRequest(BaseModel):
    audio_base64: str
    mime_type: Optional[str] = "audio/wav"
    use_history: Optional[bool] = True
    response_language_code: Optional[str] = None

class SpeechToSpeechResponse(BaseModel):
    transcript: str
    detected_language: str
    response_language: str
    answer: str
    sources: List[Dict[str, Any]]
    expanded_queries: List[str]
    validation: Optional[Dict[str, Any]] = None
    audio_base64: str

class UploadStatusResponse(BaseModel):
    status: str
    filename: Optional[str] = None
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    pages_processed: int = 0
    chunks_created: int = 0
    vectors_upserted: int = 0
    duration_seconds: Optional[float] = None
    error: Optional[str] = None

# ─────────────────────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    global chatbot, sarvam_client
    try:
        chatbot = PDFChatbot()
        print("Chatbot initialized successfully")
    except Exception as e:
        print(f" Error initializing chatbot: {e}")
        raise

    try:
        sarvam_client = SarvamClient()
        print("✅ Sarvam speech client initialized successfully")
    except Exception as e:
        sarvam_client = None
        print(f"⚠️  Sarvam speech client unavailable: {e}")

    db_ok = check_db_connection()
    if db_ok:
        print("✅ MySQL DB connected successfully")
    else:
        print("⚠️  MySQL DB connection failed — reference links will be unavailable")

# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def build_metadata(result: dict, ref_links: list) -> dict:
    return {
        "total_sources": len(result["sources"]),
        "unique_sections": len(set([s.get("full_section", "") for s in result["sources"]])),
        "completeness_score": result.get("validation", {}).get("completeness_score") if result.get("validation") else None,
        "content_sufficient": (result.get("validation", {}).get("completeness_score", 0) or 0) >= 7,
        "query_expanded": len(result.get("expanded_queries", [])) > 1,
        "reference_links_found": len(ref_links),
        "top_sources": [
            {
                "section": s.get("full_section", "Unknown")[:80],
                "page": s.get("page", "N/A"),
                "file": s.get("source_file", "N/A"),
            }
            for s in result["sources"][:3]
        ],
    }

def _decode_audio_b64(audio_b64: str) -> bytes:
    if not audio_b64 or not audio_b64.strip():
        raise HTTPException(status_code=400, detail="audio_base64 cannot be empty")
    try:
        return base64.b64decode(audio_b64, validate=True)
    except (binascii.Error, ValueError):
        raise HTTPException(status_code=400, detail="Invalid base64 audio payload")

def _encode_audio_b64(audio_bytes: bytes) -> str:
    if not audio_bytes:
        raise HTTPException(status_code=500, detail="Generated audio is empty")
    return base64.b64encode(audio_bytes).decode("utf-8")

def _normalize_lang_for_tts(language_code: Optional[str]) -> str:
    code = (language_code or "en-IN").strip()
    return code if code in LANGUAGE_DISPLAY else "en-IN"

def _compact_sources(sources: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    compact = []
    for source in sources[:5]:
        compact.append({
            "section": source.get("full_section", "Unknown"),
            "file": source.get("source_file", "N/A"),
            "page": source.get("page", "N/A"),
        })
    return compact

def _append_s2s_timing_log(metrics: Dict[str, Any]) -> None:
    """Append one speech-to-speech timing record to a plain text log file."""
    try:
        if not os.path.exists(S2S_TIMING_LOG_FILE):
            with open(S2S_TIMING_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(
                    "timestamp | decode_ms | stt_ms | chat_ms | tts_ms | "
                    "encode_ms | total_ms | transcript_chars | answer_chars | "
                    "response_language | detected_language | max_output_tokens\n"
                )

        line = (
            f"{metrics.get('timestamp', '')} | "
            f"{metrics.get('decode_ms', '')} | "
            f"{metrics.get('stt_ms', '')} | "
            f"{metrics.get('chat_ms', '')} | "
            f"{metrics.get('tts_ms', '')} | "
            f"{metrics.get('encode_ms', '')} | "
            f"{metrics.get('total_ms', '')} | "
            f"{metrics.get('transcript_chars', '')} | "
            f"{metrics.get('answer_chars', '')} | "
            f"{metrics.get('response_language', '')} | "
            f"{metrics.get('detected_language', '')} | "
            f"{metrics.get('max_output_tokens', '')}\n"
        )

        with open(S2S_TIMING_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        print(f"Timing log write failed: {e}")

# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "Media Literacy Chatbot API is running",
        "docs": "/docs",
        "health": "/health",
    }


# ─────────────────────────────────────────────────────────────
# PDF Upload
# ─────────────────────────────────────────────────────────────

def _run_pdf_ingestion(pdf_path: str, filename: str) -> None:
    """
    Full ingestion pipeline — runs in a background thread:
      1. PyMuPDF  → extract + clean text
      2. TXTStructureParser → sections → chunks
      3. PineconeClient → clear old index, upsert new vectors (REPLACE mode)
      4. build_bm25_cache() → rebuild BM25 + spell vocab
      5. Reload BM25 in live chatbot (no restart needed)
    """
    global _upload_status
    t0 = time.perf_counter()
    _upload_status.update({
        "status": "processing",
        "filename": filename,
        "started_at": datetime.utcnow().isoformat(),
        "pages_processed": 0,
        "chunks_created": 0,
        "vectors_upserted": 0,
        "duration_seconds": None,
        "error": None,
    })

    try:
        # ── Step 1: Extract & clean the NEW PDF only ──────────────────────
        print(f"📄 [Upload] Extracting: {filename}")
        from pdf_preprocessor import extract_and_clean_pdf
        import fitz

        doc = fitz.open(pdf_path)
        page_count = doc.page_count
        doc.close()

        cleaned_text = extract_and_clean_pdf(pdf_path)
        _upload_status["pages_processed"] = page_count

        # ── Step 1.5: AI relevance layer — keep ONLY in-domain content ─────
        # Classify the PDF paragraph-by-paragraph and drop anything outside the
        # Media Literacy / Mass Comm & Journalism domain (astronomy, cars, etc.)
        # BEFORE it is saved / indexed, so off-domain text can never be answered.
        print("🧹 [Upload] Running AI relevance filter (Media Literacy domain)...")
        from relevance_filter import filter_text
        _flt_llm = chatbot.llm_client if chatbot is not None else None
        filtered_text, fstats = filter_text(cleaned_text, _flt_llm)
        _upload_status["paragraphs_total"] = fstats["total"]
        _upload_status["paragraphs_kept"] = fstats["kept"]
        _upload_status["paragraphs_dropped"] = fstats["dropped"]
        print(f"🧹 [Upload] Relevance filter ({fstats['method']}): kept {fstats['kept']}/"
              f"{fstats['total']} paragraphs, dropped {fstats['dropped']} off-domain")
        if fstats["dropped_samples"]:
            print(f"   dropped e.g.: {fstats['dropped_samples']}")
        if not filtered_text.strip():
            # Whole PDF was off-domain — don't keep the stray upload file.
            try:
                os.remove(pdf_path)
            except OSError:
                pass
            raise ValueError(
                "No Media Literacy / Mass Communication & Journalism content was "
                "found in this PDF — nothing was added to the knowledge base."
            )
        cleaned_text = filtered_text

        # Save individual .txt for this PDF (filtered content only)
        os.makedirs("data/txts", exist_ok=True)
        stem = os.path.splitext(filename)[0]
        txt_path = f"data/txts/{stem}.txt"
        with open(txt_path, "w", encoding="utf-8") as f:
            f.write(cleaned_text)
        print(f"✅ [Upload] Saved: {txt_path}  ({page_count} pages, filtered)")

        # ── Step 2: (RE)WRITE this PDF's block in combined_book.txt (for BM25) ──
        # Dedup: if this source was uploaded before, REPLACE its old block in place
        # instead of appending a duplicate. Duplicate blocks produce identical BM25
        # chunks that inflate/skew lexical scoring (this was a live bug).
        combined_path = "data/txts/combined_book.txt"
        banner = f"{'='*70}\n=== SOURCE: {stem}.txt ===\n{'='*70}"
        block = f"\n\n{banner}\n\n{cleaned_text}"
        existing = ""
        if os.path.exists(combined_path):
            with open(combined_path, "r", encoding="utf-8") as f:
                existing = f.read()
        if banner in existing:
            # Remove the previous block for this source: from its banner up to the
            # next SOURCE banner (or EOF). Content before the first banner (the
            # original corpus) is always preserved.
            start = existing.index(banner)
            nxt = existing.find(f"{'='*70}\n=== SOURCE: ", start + len(banner))
            existing = (existing[:start] + (existing[nxt:] if nxt != -1 else "")).rstrip()
            with open(combined_path, "w", encoding="utf-8") as f:
                f.write(existing + block)
            print(f"♻️  [Upload] Replaced existing '{stem}' block in combined_book.txt (no duplicate)")
        else:
            with open(combined_path, "a", encoding="utf-8") as f:
                f.write(block)
            print(f"✅ [Upload] Appended to combined_book.txt")

        # ── Step 3: Parse & chunk the NEW txt ONLY ───────────────────────
        print("🔍 [Upload] Parsing new document structure...")
        from txt_processor import TXTStructureParser
        from dataclasses import dataclass

        parser = TXTStructureParser()
        new_sections = parser.parse_txt_file(txt_path)   # ← only new file
        # Smaller chunks for uploads (vs 400 for the bulk corpus): keeps each chunk's
        # FULL text under the 1500-char metadata cap (so nothing the LLM sees is
        # truncated away) and keeps rare terms from being diluted across 400 words —
        # both were why uploaded terms like "doomscrolling" weren't retrievable.
        new_chunks = parser.create_chunks(new_sections, chunk_size=180, overlap=40)

        # Re-id every upload chunk with a deterministic, file-scoped prefix so we can
        # (a) replace ONLY this file's vectors on re-upload and (b) ACCUMULATE other
        # uploaded PDFs in the 'uploads' namespace instead of wiping them.
        safe_stem = re.sub(r"[^A-Za-z0-9]+", "_", stem).strip("_") or "doc"
        id_prefix = f"up_{safe_stem}_chunk"
        for n, c in enumerate(new_chunks):
            c["id"] = f"{id_prefix}{n}"
            c["metadata"]["source_file"] = f"{stem}.txt"
        _upload_status["chunks_created"] = len(new_chunks)
        print(f"✅ [Upload] New PDF → {len(new_sections)} sections → {len(new_chunks)} chunks")

        # ── Step 4: Encode + upsert new chunks to 'uploads' namespace ────
        print(f"⚡ [Upload] Embedding {len(new_chunks)} new chunks...")
        from pinecone_client import PineconeClient

        pc = PineconeClient()

        # ACCUMULATE mode: delete only THIS file's previous vectors (by id prefix),
        # leaving other uploaded PDFs searchable. (Replaces the old delete_all wipe.)
        print(f"🗑️  [Upload] Clearing previous vectors for '{stem}' (prefix {id_prefix})...")
        try:
            old_ids = []
            for page in pc.index.list(prefix=id_prefix, namespace="uploads"):
                old_ids.extend(page if isinstance(page, list) else [page])
            if old_ids:
                for i in range(0, len(old_ids), 1000):
                    pc.index.delete(ids=old_ids[i:i + 1000], namespace="uploads")
                print(f"✅ [Upload] Removed {len(old_ids)} stale vectors for '{stem}'")
            else:
                print(f"✅ [Upload] No previous vectors for '{stem}' (first upload)")
        except Exception as e:
            print(f"⚠️  [Upload] Could not clear previous '{stem}' vectors: {e}")

        @dataclass
        class _PineconeChunk:
            chunk_id: str
            text: str
            metadata: dict
            section_path: list

        pinecone_chunks = [
            _PineconeChunk(
                chunk_id=c["id"],
                text=c["text"],
                metadata=c["metadata"],
                section_path=c["section_path"],
            )
            for c in new_chunks
        ]
        pc.upsert_chunks(
            pinecone_chunks,
            namespace="uploads",
            progress_callback=lambda n: _upload_status.update({"vectors_upserted": n})
        )
        _upload_status["vectors_upserted"] = len(pinecone_chunks)
        print(f"✅ [Upload] Upserted {len(pinecone_chunks)} new vectors to Pinecone namespace 'uploads'")

        # ── Step 5: Rebuild BM25 from combined_book.txt ───────────────────
        print("🔨 [Upload] Rebuilding BM25 keyword index...")
        from build_bm25_cache import build_cache
        build_cache(txt_path=combined_path)
        print("✅ [Upload] BM25 cache rebuilt")

        # ── Step 6: Reload BM25 in live chatbot (no server restart) ──────
        if chatbot is not None:
            try:
                from hybrid_retriever import BM25Index
                if hasattr(chatbot, "retriever") and hasattr(chatbot.retriever, "bm25"):
                    chatbot.retriever.bm25 = BM25Index()
                    print("✅ [Upload] BM25 reloaded in live chatbot")
                # Refresh the trusted-uploads cache so the new PDF's content is
                # answerable immediately (bypasses strict validation) — no restart.
                if hasattr(chatbot, "reload_uploaded_docs"):
                    chatbot.reload_uploaded_docs()
                    print("✅ [Upload] Trusted-uploads cache refreshed in live chatbot")
            except Exception as e:
                print(f"⚠️  [Upload] BM25 live reload failed (restart server to apply): {e}")

        duration = round(time.perf_counter() - t0, 2)
        _upload_status.update({
            "status": "done",
            "finished_at": datetime.utcnow().isoformat(),
            "duration_seconds": duration,
        })
        print(f"🎉 [Upload] Done in {duration}s — '{filename}' is now searchable via /chat")

    except Exception as e:
        import traceback
        err = str(e)
        print(f"❌ [Upload] Ingestion failed: {err}")
        traceback.print_exc()
        _upload_status.update({
            "status": "error",
            "finished_at": datetime.utcnow().isoformat(),
            "error": err,
            "duration_seconds": round(time.perf_counter() - t0, 2),
        })


@app.post("/upload-pdf", status_code=202)
async def upload_pdf(file: UploadFile = File(...)):
    """
    Upload a PDF to the RAG knowledge base.

    - Accepts: multipart/form-data with a PDF file
    - Returns: 202 Accepted immediately
    - Use GET /upload-pdf/status to track progress
    - Mode: REPLACE — clears and rebuilds the Pinecone index with all PDFs
    """
    # Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are accepted (.pdf extension required)")

    # Block concurrent uploads
    if _upload_status.get("status") == "processing":
        raise HTTPException(
            status_code=409,
            detail=f"Another upload is already in progress: {_upload_status.get('filename')}. Please wait."
        )

    # Read & size-check
    contents = await file.read()
    if len(contents) > MAX_PDF_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"PDF too large ({len(contents) // (1024*1024)} MB). Maximum allowed is 50 MB."
        )

    # Save to pdfs/ folder
    safe_name = os.path.basename(file.filename)  # strip any path traversal
    dest_path = os.path.join(PDF_UPLOAD_DIR, safe_name)
    with open(dest_path, "wb") as f:
        f.write(contents)
    print(f"📥 [Upload] Saved {safe_name} ({len(contents) // 1024} KB) to {dest_path}")

    # Start background ingestion thread
    thread = threading.Thread(
        target=_run_pdf_ingestion,
        args=(dest_path, safe_name),
        daemon=True,
    )
    thread.start()

    return {
        "message": f"PDF '{safe_name}' accepted. Ingestion started in background.",
        "filename": safe_name,
        "size_kb": round(len(contents) / 1024, 1),
        "status": "processing",
        "track_progress": "GET /upload-pdf/status",
    }


@app.get("/upload-pdf/status", response_model=UploadStatusResponse)
async def upload_pdf_status():
    """
    Check the status of the most recent PDF upload/ingestion.

    Status values:
    - idle: No upload has been started yet
    - processing: Ingestion is running in the background
    - done: Successfully ingested — PDF is now searchable
    - error: Ingestion failed — check 'error' field for details
    """
    return _upload_status


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "healthy",
        "message": "Media Literacy Chatbot API is running",
        "chatbot_ready": chatbot is not None,
        "speech_ready": sarvam_client is not None,
        "db_connected": check_db_connection(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: QuestionRequest, response: Response):
    """
    Send a question to the chatbot.

    Returns the answer, sources, validation metadata, AND reference links
    pulled from the MySQL database matched to the topic of the answer.
    """
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    start_time = time.perf_counter()
    print(f"DEBUG TIMING: Start Processing question: {request.question[:30]} | Model: {request.model}")

    try:
        # ── 1. Get chatbot answer ──
        t1 = time.perf_counter()
        print(f"DEBUG TIMING: Before ask_question_with_follow_ups: {t1 - start_time:.4f}s")
        # Check if the chatbot object has ask_question_with_follow_ups, 
        # otherwise fallback to ask_question
        if hasattr(chatbot, 'ask_question_with_follow_ups'):
            result = chatbot.ask_question_with_follow_ups(
                question=request.question.strip(),
                model=request.model,
                use_history=request.use_history if request.use_history is not None else True,
            )
        else:
            result = chatbot.ask_question(
                question=request.question.strip(),
                model=request.model,
                use_history=request.use_history if request.use_history is not None else True,
            )

        t2 = time.perf_counter()
        print(f"DEBUG TIMING: After ask_question_with_follow_ups: {t2 - start_time:.4f}s")

        # ── 2. Read Reference Links from Cache ──
        t3 = time.perf_counter()
        print(f"DEBUG TIMING: Before reading reference links: {t3 - start_time:.4f}s")
        ref_links_data = result.get("reference_links", [])
        ref_links = [
            ReferenceLink(
                title=link.get("title", ""),
                url=link.get("url", ""),
                relevance_score=link.get("relevance_score", 0.0),
            )
            for link in ref_links_data
        ]
        t4 = time.perf_counter()
        print(f"DEBUG TIMING: After reading reference links: {t4 - start_time:.4f}s")

        # ── 3. Build response ──
        t5 = time.perf_counter()
        print(f"DEBUG TIMING: Before building response: {t5 - start_time:.4f}s")
        chat_response = {
            "answer": result["answer"],
            "sources": result["sources"],
            "expanded_queries": result.get("expanded_queries", []),
            "validation": result.get("validation"),
            "metadata": build_metadata(result, ref_links_data),
            "reference_links": ref_links,
            "follow_up_questions": result.get("follow_up_questions"),
        }
        t6 = time.perf_counter()
        print(f"DEBUG TIMING: After building response: {t6 - start_time:.4f}s")

        # ── 3.5. Inject X-Cache Header ──
        if result.get("is_cache_hit"):
            response.headers["X-Cache"] = "HIT"
        else:
            response.headers["X-Cache"] = "MISS"

        # ── 4. Log detailed metrics ──
        duration_ms = (time.perf_counter() - start_time) * 1000
        answer_text = result["answer"].lower()
        is_on_topic = "outside the scope" not in answer_text
        has_sources = len(result["sources"]) > 0

        log_request_metrics(
            endpoint="/chat",
            status_code=200,
            response_time_ms=duration_ms,
            model=request.model or "1",
            on_topic=is_on_topic,
            has_sources=has_sources
        )

        return chat_response

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.get("/metrics/summary")
async def metrics_summary():
    """Get aggregated metrics for the dashboard."""
    return get_metrics_summary()


@app.post("/chat/simple")
async def chat_simple(request: QuestionRequest, response: Response):
    """
    Returns only the answer text + reference links (no full metadata).
    Lightweight endpoint for simple frontend integrations.
    """
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history if request.use_history is not None else True,
        )

        ref_links = []
        if result.get("sources"):
            ref_links = find_reference_links(
                sources=result["sources"],
                answer=result.get("answer", ""),
                min_score=0.4,
                max_links=5,
            )

        if result.get("is_cache_hit"):
            response.headers["X-Cache"] = "HIT"
        else:
            response.headers["X-Cache"] = "MISS"

        return {
            "answer": result["answer"],
            "reference_links": ref_links,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/chat/explain-selection")
async def explain_selection(request: SelectionRequest):
    """
    Explain a specific part of a bot answer that the user highlighted.
    """
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.selected_text or not request.selected_text.strip():
        raise HTTPException(status_code=400, detail="selected_text cannot be empty")
    if not request.full_bot_message or not request.full_bot_message.strip():
        raise HTTPException(status_code=400, detail="full_bot_message cannot be empty")

    try:
        result = chatbot.explain_selection(
            selected_text=request.selected_text.strip(),
            full_bot_message=request.full_bot_message.strip(),
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating explanation: {str(e)}")


@app.post("/clear-history")
async def clear_history():
    """Clear the conversation history."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    try:
        chatbot.clear_history()
        return {"status": "success", "message": "Conversation history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@app.get("/history")
async def get_history():
    """Get the current conversation history."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    try:
        return {
            "history": chatbot.get_history() if hasattr(chatbot, 'get_history') else [],
            "count": len(chatbot.get_history()) if hasattr(chatbot, 'get_history') else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")


@app.post("/text-to-text", response_model=TextToTextResponse)
async def text_to_text(request: TextToTextRequest):
    """Text pipeline: question (any language) → English → RAG → translate back."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if sarvam_client is None:
        raise HTTPException(status_code=503, detail="Speech service not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    if request.language_code:
        language_code = _normalize_lang_for_tts(request.language_code)
    else:
        language_code = sarvam_client.detect_language(request.question)

    question = request.question.strip()

    # Step 1: Translate question to English (skip if already English)
    if language_code == "en-IN":
        english_question = question
    else:
        try:
            english_question = sarvam_client.translate(
                text=question,
                target_language_code="en-IN",
                source_language_code=language_code,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

    # Step 2: RAG pipeline
    try:
        result = chatbot.ask_question(
            question=english_question,
            use_history=request.use_history if request.use_history is not None else True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")

    english_answer = result.get("answer", "")
    if not english_answer.strip():
        raise HTTPException(status_code=500, detail="Generated answer is empty")

    # Step 3: Translate answer back to user's language (skip if English)
    if language_code == "en-IN":
        translated_answer = english_answer
    else:
        try:
            translated_answer = sarvam_client.translate(
                text=english_answer,
                target_language_code=language_code,
                source_language_code="en-IN",
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Answer translation failed: {str(e)}")

    return {
        "original_question": request.question,
        "detected_language": language_code,
        "detected_language_name": LANGUAGE_DISPLAY.get(language_code, "Unknown"),
        "english_question": english_question,
        "answer": translated_answer,
        "sources": _compact_sources(result.get("sources", [])),
        "expanded_queries": result.get("expanded_queries", []),
        "validation": result.get("validation"),
    }


@app.post("/speech-to-speech", response_model=SpeechToSpeechResponse)
async def speech_to_speech(request: SpeechToSpeechRequest, raw_request: Request):
    """Full pipeline: audio → transcript → chat answer → response audio."""
    request_start = time.perf_counter()

    # ── Rate limit check ──
    client_ip = raw_request.client.host
    if not s2s_limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")

    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if sarvam_client is None:
        raise HTTPException(status_code=503, detail="Speech service not initialized")

    decode_start = time.perf_counter()
    audio_bytes = _decode_audio_b64(request.audio_base64)
    decode_ms = round((time.perf_counter() - decode_start) * 1000, 2)

    # ── Audio size check ──
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too long. Max ~30 seconds allowed.")

    # Step 1: Transcribe
    try:
        stt_start = time.perf_counter()
        transcript, detected_language = sarvam_client.speech_to_text_bytes(
            audio_bytes=audio_bytes,
            mime_type=request.mime_type or "audio/wav",
        )
        stt_ms = round((time.perf_counter() - stt_start) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="No speech detected in audio")

    # Step 2: Get chat answer
    try:
        chat_start = time.perf_counter()
        result = chatbot.ask_question(
            question=transcript.strip(),
            use_history=request.use_history if request.use_history is not None else True,
        )
        chat_ms = round((time.perf_counter() - chat_start) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")

    answer = result.get("answer", "")
    if not answer.strip():
        raise HTTPException(status_code=503, detail="Question is outside course material")

    # Step 3: Generate response audio
    response_language = _normalize_lang_for_tts(request.response_language_code or detected_language)

    try:
        tts_start = time.perf_counter()
        if response_language == "en-IN":
            answer_audio = sarvam_client.text_to_speech_bytes(answer, response_language)
        else:
            answer_audio = sarvam_client.translate_to_speech_bytes(
                text=answer,
                target_language_code=response_language,
                source_language_code="en-IN",
            )
        tts_ms = round((time.perf_counter() - tts_start) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Speech synthesis failed: {str(e)}")

    encode_start = time.perf_counter()
    audio_b64 = _encode_audio_b64(answer_audio)
    encode_ms = round((time.perf_counter() - encode_start) * 1000, 2)
    total_ms = round((time.perf_counter() - request_start) * 1000, 2)

    # Get current time in IST
    ist_now = datetime.utcnow() + timedelta(hours=5, minutes=30)
    
    _append_s2s_timing_log({
        "timestamp": ist_now.isoformat(timespec="seconds") + "+05:30",
        "decode_ms": decode_ms,
        "stt_ms": stt_ms,
        "chat_ms": chat_ms,
        "tts_ms": tts_ms,
        "encode_ms": encode_ms,
        "total_ms": total_ms,
        "transcript_chars": len(transcript),
        "answer_chars": len(answer),
        "response_language": response_language,
        "detected_language": detected_language,
        "max_output_tokens": 1000,
    })

    return {
        "transcript": transcript,
        "detected_language": detected_language,
        "response_language": response_language,
        "answer": answer,
        "sources": _compact_sources(result.get("sources", [])),
        "expanded_queries": result.get("expanded_queries", []),
        "validation": result.get("validation"),
        "audio_base64": audio_b64,
    }

# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.path.exists("data/processed/txt_processed.flag"):
        print("\n❌ TXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        exit(1)

    print("\n" + "=" * 60)
    print("🚀 Starting Media Literacy Chatbot API Server")
    print("=" * 60)
    print("📡 API:  http://localhost:8000")
    print("📚 Docs: http://localhost:8000/docs")
    print("=" * 60 + "\n")

    uvicorn.run("api_server:app", host="localhost", port=8000, reload=True, log_level="info")
