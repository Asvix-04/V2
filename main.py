"""
main.py — Digilab Media Literacy Chatbot  v3.2.0

Fixes applied vs v3.1.0:
  [F1] Streaming endpoint now goes through chatbot pipeline
       (safety gates + classification + history all included)
  [F2] Duplicate HybridRetriever removed — chatbot's retriever reused
  [F3] Streaming saves conversation history (use_history=True)
  [F4] Per-session chatbot instances — no shared mutable state / race condition
  [F5] CORS locked to specific origins (not wildcard *)
  [F6] Deprecated @app.on_event replaced with lifespan context manager
  [F7] /history endpoint requires session_id (no global history leak)

Run as API:  uvicorn main:app --reload
Run as CLI:  python main.py --cli
"""

import os
import sys
import base64
import binascii
import time
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request, Cookie, Response, UploadFile, File, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Generator
import threading
import uvicorn

from chatbot import PDFChatbot
from llm_client import AVAILABLE_MODELS, ModelConfig
from sarvam_client import SarvamClient, LANGUAGE_DISPLAY
from utils import MAX_AUDIO_BYTES, s2s_limiter

try:
    from Db import find_reference_links, check_db_connection
except ImportError:
    def find_reference_links(*args, **kwargs):
        return []
    def check_db_connection():
        return False

load_dotenv()

S2S_TIMING_LOG_FILE = "s2s_timing_log.txt"

# ─────────────────────────────────────────────────────────────
# Session Store
# In production replace with Redis:
#   from redis import Redis
#   r = Redis(); r.set(session_id, pickle.dumps(history))
# ─────────────────────────────────────────────────────────────

_sessions: Dict[str, PDFChatbot] = {}
_SESSION_COOKIE = "digilab_session"
_SESSION_MAX_AGE = 60 * 60 * 2  # 2 hours

# Global instance initialized once to avoid 13-second startup penalty per session
print("Initializing global chatbot instance...")
_global_bot = PDFChatbot()
print("Global chatbot instance ready.")


def _get_or_create_session(session_id: Optional[str]) -> tuple[str, PDFChatbot]:
    """Return (session_id, chatbot). Creates a new session if needed."""
    if not session_id or session_id not in _sessions:
        session_id = str(uuid.uuid4())
        # Fast clone to avoid 13s init penalty while keeping history isolated
        new_bot = PDFChatbot.__new__(PDFChatbot)
        new_bot.model_config = _global_bot.model_config
        new_bot.llm_client = _global_bot.llm_client
        new_bot.retriever = _global_bot.retriever
        new_bot.conversation_history = []
        new_bot.follow_up_generator = _global_bot.follow_up_generator
        new_bot._system_prompt = _global_bot._system_prompt
        new_bot.streaming_llm = _global_bot.streaming_llm
        new_bot._uploaded_docs = _global_bot._uploaded_docs
        _sessions[session_id] = new_bot
    return session_id, _sessions[session_id]


def _set_session_cookie(response: Response, session_id: str) -> None:
    response.set_cookie(
        key=_SESSION_COOKIE,
        value=session_id,
        httponly=True,
        samesite="lax",
        max_age=_SESSION_MAX_AGE,
    )


# ─────────────────────────────────────────────────────────────
# Lifespan  [F6: replaces deprecated @app.on_event("startup")]
# ─────────────────────────────────────────────────────────────

_sarvam_client: Optional[SarvamClient] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _sarvam_client

    # Sarvam speech client (shared — stateless, thread-safe)
    try:
        _sarvam_client = SarvamClient()
        print("✅ Sarvam speech client initialized")
    except Exception as e:
        _sarvam_client = None
        print(f"⚠️  Sarvam unavailable: {e}")

    # [F2] No separate streaming_retriever — chatbot instances reuse their own retriever
    print("✅ Per-session chatbot instances will be created on first request")

    if check_db_connection():
        print("✅ MySQL DB connected — reference links enabled")
    else:
        print("⚠️  MySQL DB unavailable — reference links disabled")

    yield  # app runs here

    print("🔄 Shutdown — clearing session store")
    _sessions.clear()


# ─────────────────────────────────────────────────────────────
# FastAPI App
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Digilab — Media Literacy Chatbot API",
    description="IGNOU Media Literacy Course Chatbot with streaming, reference links & speech",
    version="3.2.0",
    lifespan=lifespan,  # [F6]
)

# [F5] CORS — specific origins only
_ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:3000,http://localhost:5173,http://127.0.0.1:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization", "multipart/form-data"],
)


# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
    use_history: Optional[bool] = True
    model: Optional[str] = None

class StreamingChatRequest(BaseModel):
    question: str

class ModelSwitchRequest(BaseModel):
    model_key: str  # "1", "2", or "3"

class ReferenceLink(BaseModel):
    url: str
    clickable: str

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
    db_connected: bool
    active_sessions: int
    streaming_available: bool

class SelectionRequest(BaseModel):
    selected_text: str
    full_bot_message: str

class TextToTextRequest(BaseModel):
    question: str
    language_code: Optional[str] = None
    use_history: Optional[bool] = True

class TextToTextResponse(BaseModel):
    original_question: str
    detected_language: str
    detected_language_name: str
    english_question: str
    answer: str
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


# ─────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────

def check_txt_processing() -> bool:
    return os.path.exists("data/processed/txt_processed.flag")


def build_metadata(result: dict, ref_links: list) -> dict:
    return {
        "total_sources": len(result["sources"]),
        "unique_sections": len(set(s.get("full_section", "") for s in result["sources"])),
        "completeness_score": (result.get("validation") or {}).get("completeness_score"),
        "content_sufficient": ((result.get("validation") or {}).get("completeness_score", 0) or 0) >= 7,
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


def is_out_of_scope(answer_text: str) -> bool:
    t = answer_text.lower()
    return "outside the scope" in t or "outside of the scope" in t


def get_ref_links(result: dict) -> list:
    if "reference_links" in result:
        return result["reference_links"]
        
    if not result.get("sources") or is_out_of_scope(result.get("answer", "")):
        return []
    return find_reference_links(
        sources=result["sources"],
        answer=result.get("answer", ""),
        min_score=0.5,
        max_links=5,
    )


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
    return [
        {
            "section": s.get("full_section", "Unknown"),
            "file": s.get("source_file", "N/A"),
            "page": s.get("page", "N/A"),
        }
        for s in sources[:5]
    ]


def _append_s2s_timing_log(metrics: Dict[str, Any]) -> None:
    try:
        if not os.path.exists(S2S_TIMING_LOG_FILE):
            with open(S2S_TIMING_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(
                    "timestamp | decode_ms | stt_ms | chat_ms | tts_ms | "
                    "encode_ms | total_ms | transcript_chars | answer_chars | "
                    "response_language | detected_language\n"
                )
        line = " | ".join(str(metrics.get(k, "")) for k in [
            "timestamp", "decode_ms", "stt_ms", "chat_ms", "tts_ms",
            "encode_ms", "total_ms", "transcript_chars", "answer_chars",
            "response_language", "detected_language",
        ]) + "\n"
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
        "message": "Digilab Media Literacy Chatbot API is running",
        "version": "3.2.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "chat": "POST /chat — full response",
            "chat_simple": "POST /chat/simple — lightweight",
            "chat_stream": "POST /chat/stream — streaming SSE",
            "model_switch": "POST /model/switch",
            "model_current": "GET /model/current",
        },
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "healthy",
        "message": "Digilab API is running",
        "db_connected": check_db_connection(),
        "active_sessions": len(_sessions),
        "streaming_available": True,  # always available — uses chatbot pipeline
    }


# ─────────────────────────────────────────────────────────────
# Chat endpoints
# ─────────────────────────────────────────────────────────────

@app.post("/chat", response_model=ChatResponse)
async def chat(
    request: QuestionRequest,
    response: Response,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    """Full response: answer + sources + validation + reference links."""
    import time
    t0 = time.time()
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # [F4] Per-session chatbot
    sid, bot = _get_or_create_session(session_id)
    _set_session_cookie(response, sid)
    t1 = time.time()
    print(f"DEBUG: Setup took {t1 - t0:.4f}s")

    try:
        t2 = time.time()
        result = bot.ask_question_with_follow_ups(
            question=request.question.strip(),
            use_history=request.use_history,
            model=request.model,
            session_id=sid
        )
        t3 = time.time()
        print(f"DEBUG: ask_question took {t3 - t2:.4f}s (Cache Hit: {result.get('is_cache_hit')})")

        t4 = time.time()
        raw_links = get_ref_links(result)
        ref_links = [
            ReferenceLink(url=l["url"], clickable=l.get("title", l["url"]))
            for l in raw_links
        ]
        t5 = time.time()
        print(f"DEBUG: get_ref_links took {t5 - t4:.4f}s")

        if result.get("is_cache_hit"):
            response.headers["X-Cache"] = "HIT"
        else:
            response.headers["X-Cache"] = "MISS"

        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "expanded_queries": result.get("expanded_queries", []),
            "validation": result.get("validation"),
            "metadata": build_metadata(result, ref_links),
            "reference_links": ref_links,
            "follow_up_questions": result.get("follow_up_questions"),
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/chat/simple")
async def chat_simple(
    request: QuestionRequest,
    response: Response,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    """Lightweight: answer text + reference links only."""
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    sid, bot = _get_or_create_session(session_id)
    _set_session_cookie(response, sid)

    try:
        result = bot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history,
            session_id=sid
        )
        ref_links = get_ref_links(result)

        if result.get("is_cache_hit"):
            response.headers["X-Cache"] = "HIT"
        else:
            response.headers["X-Cache"] = "MISS"

        return {"answer": result["answer"], "reference_links": ref_links}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


# ─────────────────────────────────────────────────────────────
# [F1][F2][F3] STREAMING ENDPOINT — Fixed
# ─────────────────────────────────────────────────────────────

@app.post("/chat/stream")
async def chat_stream(
    request: StreamingChatRequest,
    raw_request: Request,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    """
    Stream chatbot response token by token (Server-Sent Events).

    [F1] Goes through full chatbot pipeline — safety gates, classification,
         retrieval, validation all included (same as /chat).
    [F2] Uses chatbot's own HybridRetriever — no duplicate connection.
    [F3] History is saved after streaming completes.
    [F4] Per-session chatbot instance.

    Returns: SSE stream
      data: {"token": "...", "done": false}
      data: {"token": "",    "done": true}
      data: {"error": "...", "done": true}   ← on failure

    Example:
      curl -N http://localhost:8000/chat/stream \\
        -X POST -H "Content-Type: application/json" \\
        -d '{"question":"What is media literacy?"}'
    """
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # [F4] Get session bot — but don't set cookie inside StreamingResponse
    # (headers are already sent). We get sid here and pass bot in.
    sid, bot = _get_or_create_session(session_id)

    def generate() -> Generator[str, None, None]:
        try:
            print(f"🔄 Stream [{sid[:8]}]: {request.question[:60]}...")

            # [F1][F2][F3] Full chatbot pipeline with streaming
            for token in bot.ask_question_stream(
                question=request.question.strip(),
                use_history=True,   # [F3] history saved inside ask_question_stream
            ):
                yield f"data: {json.dumps({'token': token, 'done': False})}\n\n"

            yield f"data: {json.dumps({'token': '', 'done': True})}\n\n"
            print(f"✅ Stream complete [{sid[:8]}]")

        except GeneratorExit:
            # Client disconnected mid-stream — clean exit, no error
            print(f"⚡ Client disconnected [{sid[:8]}]")

        except Exception as e:
            print(f"❌ Stream error [{sid[:8]}]: {e}")
            yield f"data: {json.dumps({'error': str(e), 'done': True})}\n\n"

    # Set session cookie in headers before streaming starts
    headers = {
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",       # disable Nginx response buffering
        "Connection": "keep-alive",
        "Set-Cookie": (
            f"{_SESSION_COOKIE}={sid}; HttpOnly; SameSite=lax; "
            f"Max-Age={_SESSION_MAX_AGE}; Path=/"
        ),
    }

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers=headers,
    )


# ─────────────────────────────────────────────────────────────
# Explain selection
# ─────────────────────────────────────────────────────────────

@app.post("/chat/explain-selection")
async def explain_selection(
    request: SelectionRequest,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    if not request.selected_text or not request.selected_text.strip():
        raise HTTPException(status_code=400, detail="selected_text cannot be empty")
    if not request.full_bot_message or not request.full_bot_message.strip():
        raise HTTPException(status_code=400, detail="full_bot_message cannot be empty")

    _, bot = _get_or_create_session(session_id)

    try:
        return bot.explain_selection(
            selected_text=request.selected_text.strip(),
            full_bot_message=request.full_bot_message.strip(),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating explanation: {str(e)}")


# ─────────────────────────────────────────────────────────────
# Model management
# ─────────────────────────────────────────────────────────────

@app.post("/model/switch")
async def switch_model(
    request: ModelSwitchRequest,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    if request.model_key not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail="Invalid model key. Use '1', '2', or '3'.")

    _, bot = _get_or_create_session(session_id)
    new_config = AVAILABLE_MODELS[request.model_key]
    bot.switch_model(new_config)
    return {
        "status": "success",
        "message": f"Switched to {new_config.display_name}",
        "model": new_config.display_name,
    }


@app.get("/model/current")
async def get_current_model(
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    _, bot = _get_or_create_session(session_id)
    return {
        "model": bot.model_config.display_name,
        "description": bot.model_config.description,
    }


@app.get("/model/available")
async def get_available_models():
    return {
        "models": [
            {"key": k, "name": v.display_name, "description": v.description}
            for k, v in AVAILABLE_MODELS.items()
        ]
    }


# ─────────────────────────────────────────────────────────────
# History  [F7: session-scoped, no global leak]
# ─────────────────────────────────────────────────────────────

@app.post("/clear-history")
async def clear_history(
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    _, bot = _get_or_create_session(session_id)
    bot.clear_history()
    return {"status": "success", "message": "Conversation history cleared"}


@app.get("/history")
async def get_history(
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    """[F7] Returns history for THIS session only — no cross-user data."""
    if not session_id or session_id not in _sessions:
        return {"history": [], "count": 0}

    bot = _sessions[session_id]
    return {
        "history": bot.conversation_history,
        "count": len(bot.conversation_history),
    }


# ─────────────────────────────────────────────────────────────
# Text-to-Text (multilingual)
# ─────────────────────────────────────────────────────────────

@app.post("/text-to-text", response_model=TextToTextResponse)
async def text_to_text(
    request: TextToTextRequest,
    response: Response,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    if _sarvam_client is None:
        raise HTTPException(status_code=503, detail="Speech service not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    sid, bot = _get_or_create_session(session_id)
    _set_session_cookie(response, sid)

    language_code = (
        _normalize_lang_for_tts(request.language_code)
        if request.language_code
        else _sarvam_client.detect_language(request.question)
    )

    question = request.question.strip()
    if language_code == "en-IN":
        english_question = question
    else:
        try:
            english_question = _sarvam_client.translate(
                text=question,
                target_language_code="en-IN",
                source_language_code=language_code,
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Translation failed: {str(e)}")

    try:
        result = bot.ask_question(
            question=english_question,
            use_history=request.use_history if request.use_history is not None else True,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")

    english_answer = result.get("answer", "")
    if not english_answer.strip():
        raise HTTPException(status_code=500, detail="Generated answer is empty")

    if language_code == "en-IN":
        translated_answer = english_answer
    else:
        try:
            translated_answer = _sarvam_client.translate(
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


# ─────────────────────────────────────────────────────────────
# Speech-to-Speech
# ─────────────────────────────────────────────────────────────

@app.post("/speech-to-speech", response_model=SpeechToSpeechResponse)
async def speech_to_speech(
    request: SpeechToSpeechRequest,
    raw_request: Request,
    response: Response,
    session_id: Optional[str] = Cookie(default=None, alias=_SESSION_COOKIE),
):
    request_start = time.perf_counter()

    client_ip = raw_request.client.host
    if not s2s_limiter.is_allowed(client_ip):
        raise HTTPException(status_code=429, detail="Too many requests. Try again in a minute.")

    if _sarvam_client is None:
        raise HTTPException(status_code=503, detail="Speech service not initialized")

    sid, bot = _get_or_create_session(session_id)
    _set_session_cookie(response, sid)

    decode_start = time.perf_counter()
    audio_bytes = _decode_audio_b64(request.audio_base64)
    decode_ms = round((time.perf_counter() - decode_start) * 1000, 2)

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too long. Max ~30 seconds allowed.")

    try:
        stt_start = time.perf_counter()
        transcript, detected_language = _sarvam_client.speech_to_text_bytes(
            audio_bytes=audio_bytes,
            mime_type=request.mime_type or "audio/wav",
        )
        stt_ms = round((time.perf_counter() - stt_start) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not transcript.strip():
        raise HTTPException(status_code=400, detail="No speech detected in audio")

    try:
        chat_start = time.perf_counter()
        result = bot.ask_question(
            question=transcript.strip(),
            use_history=request.use_history if request.use_history is not None else True,
        )
        chat_ms = round((time.perf_counter() - chat_start) * 1000, 2)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat generation failed: {str(e)}")

    answer = result.get("answer", "")
    if not answer.strip():
        raise HTTPException(status_code=500, detail="Generated answer is empty")

    response_language = _normalize_lang_for_tts(
        request.response_language_code or detected_language
    )

    try:
        tts_start = time.perf_counter()
        if response_language == "en-IN":
            answer_audio = _sarvam_client.text_to_speech_bytes(answer, response_language)
        else:
            answer_audio = _sarvam_client.translate_to_speech_bytes(
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

    _append_s2s_timing_log({
        "timestamp": datetime.utcnow().isoformat(timespec="seconds") + "Z",
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
# PDF Upload — Job Store & Background Pipeline
# ─────────────────────────────────────────────────────────────

# In-memory store: { job_id: { status, message, files, error } }
_upload_jobs: Dict[str, Dict[str, Any]] = {}
_upload_jobs_lock = threading.Lock()


def _run_pdf_pipeline(job_id: str, pdf_paths: List[str]) -> None:
    """Background thread: preprocess PDFs → index into Pinecone + Neo4j + BM25."""
    import shutil
    from pdf_preprocessor import extract_and_clean_pdf
    from process_txt_pipeline import process_txt_file

    def _set(status: str, message: str, error: str = ""):
        with _upload_jobs_lock:
            _upload_jobs[job_id].update({"status": status, "message": message, "error": error})

    try:
        txt_paths = []
        total = len(pdf_paths)

        for i, pdf_path in enumerate(pdf_paths, 1):
            filename = os.path.basename(pdf_path)
            stem = os.path.splitext(filename)[0]

            _set("processing", f"[{i}/{total}] Extracting text from {filename}…")
            cleaned_text = extract_and_clean_pdf(pdf_path)

            txt_out_path = os.path.join("data", "txts", f"{stem}.txt")
            os.makedirs(os.path.dirname(txt_out_path), exist_ok=True)
            with open(txt_out_path, "w", encoding="utf-8") as f:
                f.write(cleaned_text)
            txt_paths.append(txt_out_path)

            _set("processing", f"[{i}/{total}] Indexing {filename} into vector store…")
            process_txt_file(txt_out_path)

        _set("done", f"Successfully processed and indexed {total} PDF(s).")

    except Exception as exc:
        import traceback
        _set("error", "Pipeline failed — see error field.", error=traceback.format_exc())
        print(f"❌ PDF pipeline error for job {job_id}: {exc}")


class UploadStatusResponse(BaseModel):
    job_id: str
    status: str   # queued | processing | done | error
    message: str
    files: List[str]
    error: Optional[str] = None


@app.post("/upload-pdf", summary="Upload & index new PDF(s)")
async def upload_pdf(
    background_tasks: BackgroundTasks,
    files: List[UploadFile] = File(...),
):
    """
    Upload one or more PDF files. The server will:
    1. Save them to the /pdfs/ directory.
    2. Extract and clean text (pdf_preprocessor.py).
    3. Index into Pinecone + Neo4j (process_txt_pipeline.py) — in the background.

    Returns a job_id you can poll via GET /upload-status/{job_id}.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided.")

    pdf_save_dir = "pdfs"
    os.makedirs(pdf_save_dir, exist_ok=True)

    saved_paths = []
    saved_names = []

    for upload in files:
        if not upload.filename.lower().endswith(".pdf"):
            raise HTTPException(
                status_code=415,
                detail=f"Only PDF files are accepted. Got: {upload.filename}"
            )

        dest = os.path.join(pdf_save_dir, upload.filename)
        content = await upload.read()
        with open(dest, "wb") as f:
            f.write(content)
        saved_paths.append(dest)
        saved_names.append(upload.filename)

    # Create a job record
    job_id = str(uuid.uuid4())
    with _upload_jobs_lock:
        _upload_jobs[job_id] = {
            "status": "queued",
            "message": f"Queued {len(saved_paths)} PDF(s) for processing.",
            "files": saved_names,
            "error": None,
        }

    # Kick off the heavy pipeline in a background thread so we don't block the HTTP response
    thread = threading.Thread(target=_run_pdf_pipeline, args=(job_id, saved_paths), daemon=True)
    thread.start()

    return {
        "job_id": job_id,
        "status": "queued",
        "message": f"{len(saved_paths)} PDF(s) queued for processing.",
        "files": saved_names,
        "poll_url": f"/upload-status/{job_id}",
    }


@app.get("/upload-status/{job_id}", response_model=UploadStatusResponse, summary="Poll PDF upload job status")
async def upload_status(job_id: str):
    """
    Poll the status of a previously submitted /upload-pdf job.

    Status values:
    - queued      — job is waiting to start
    - processing  — pipeline is running
    - done        — PDF(s) fully indexed and ready for chat queries
    - error       — pipeline failed; see the 'error' field for details
    """
    with _upload_jobs_lock:
        job = _upload_jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found.")
    return UploadStatusResponse(job_id=job_id, **job)


# ─────────────────────────────────────────────────────────────
# CLI Mode
# ─────────────────────────────────────────────────────────────

def select_model() -> ModelConfig:
    print("\nSelect AI Model:")
    print("  [1] ⚡ Gemini Flash    — Default (Fast, cost-efficient)")
    print("  [2] 🔬 Gemini Pro      — Research (High context, deep reasoning)")
    print("  [3] 🎯 Claude Haiku    — Fast & accurate (Anthropic)")
    print()
    while True:
        choice = input("Enter choice (1-3) [default: 1]: ").strip() or "1"
        if choice in AVAILABLE_MODELS:
            model = AVAILABLE_MODELS[choice]
            print(f"\n✅ Selected: {model.description}")
            return model
        print("  ⚠️  Invalid choice. Enter 1, 2, or 3.")


def print_detailed_sources(sources: list):
    print("\n" + "=" * 70)
    print("📚 SOURCES USED:")
    print("=" * 70)
    for i, source in enumerate(sources, 1):
        print(f"\n{i}. Section: {source.get('full_section', 'Unknown')}")
        print(f"   File:    {source.get('source_file', 'N/A')}")
        print(f"   Page:    {source.get('page', 'N/A')}")
        print(f"   Preview: {source.get('text', '')[:100]}...")
    print("=" * 70)


def print_follow_up_questions(follow_up_questions) -> dict:
    if not follow_up_questions:
        return {}
    type_2 = follow_up_questions.get("type_2_context_aware", [])
    if not type_2:
        return {}
    print("\n" + "=" * 70)
    print("💡 Follow-up Questions (type the number to ask instantly):")
    print("=" * 70)
    for i, question in enumerate(type_2, 1):
        print(f"  {i}. {question}")
    print("=" * 70)
    return {str(i): q for i, q in enumerate(type_2, 1)}


def run_cli():
    print("=" * 60)
    print("📖 Digilab — Media Literacy Course Chatbot")
    print("=" * 60)

    if not check_txt_processing():
        print("\n❌ TXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        return

    print("✅ Using existing knowledge base...")

    db_ok = check_db_connection()
    print("✅ MySQL DB connected" if db_ok else "⚠️  MySQL DB unavailable")

    model_config = select_model()

    try:
        cli_chatbot = PDFChatbot(model_config=model_config)
    except Exception as e:
        print(f"\n❌ Error initializing chatbot: {e}")
        return

    print("\n" + "=" * 60)
    print("💬 Chatbot Ready!")
    print("=" * 60)
    print("Commands: 'model' | 'sources' | 'clear' | 'quit'")
    print("=" * 60 + "\n")

    last_result = None
    follow_up_map = {}

    while True:
        try:
            question = input(f"\n🎓 You [{cli_chatbot.model_config.display_name}]: ").strip()

            if not question:
                continue
            if question.lower() == "quit":
                print("👋 Goodbye!")
                break
            if question in follow_up_map:
                question = follow_up_map[question]
                print(f"\n🔗 Asking: {question}")
            if question.lower() == "model":
                cli_chatbot.switch_model(select_model())
                continue
            if question.lower() == "clear":
                cli_chatbot.clear_history()
                print("✅ History cleared!")
                continue
            if question.lower() == "sources" and last_result:
                print_detailed_sources(last_result["sources"])
                continue

            print("\n🤔 Thinking...")
            result = cli_chatbot.ask_question_with_follow_ups(question)
            last_result = result

            print("\n" + "=" * 70)
            print("🤖 Digilab:")
            print("=" * 70)
            print(result["answer"])
            print("=" * 70)

            if result["sources"]:
                print(f"\n📚 {len(result['sources'])} source(s) — type 'sources' for details")

            if db_ok and result.get("sources") and not is_out_of_scope(result.get("answer", "")):
                ref_links = find_reference_links(
                    sources=result["sources"],
                    answer=result.get("answer", ""),
                    min_score=0.5,
                    max_links=5,
                )
                if ref_links:
                    print("\n🔗 Reference Links:")
                    for i, link in enumerate(ref_links, 1):
                        print(f"  {i}. {link['url']}")

            follow_up_map = print_follow_up_questions(result.get("follow_up_questions", {}))

        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()


# ─────────────────────────────────────────────────────────────
# Entry Point
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if "--cli" in sys.argv:
        run_cli()
    else:
        if not check_txt_processing():
            print("\n❌ TXT file not processed yet!")
            print("Please run: python process_txt_pipeline.py")
            sys.exit(1)

        print("\n" + "=" * 60)
        print("🚀 Starting Digilab API Server v3.2.0")
        print("=" * 60)
        print("📡 API:       http://localhost:8000")
        print("📚 Docs:      http://localhost:8000/docs")
        print("🔄 Streaming: http://localhost:8000/chat/stream")
        print("=" * 60 + "\n")

        uvicorn.run(
            "main:app",
            host="0.0.0.0",
            port=8000,
            reload=True,
            log_level="info",
        )