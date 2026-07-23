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
import sys
import time
from datetime import datetime, timedelta
from collections import defaultdict
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
from chatbot import PDFChatbot
from llm_client import AVAILABLE_MODELS
from sarvam_client import SarvamClient, LANGUAGE_DISPLAY
from metrics_logger import log_request_metrics, get_metrics_summary
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

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")
except AttributeError:
    pass

S2S_TIMING_LOG_FILE = "s2s_timing_log.txt"

MODEL_ALIASES = {
    "gemini 2.5 flash": "1",
    "gemini-2.5-flash": "1",
    "gemini 2.5 pro": "2",
    "gemini-2.5-pro": "2",
    "deepseek v3.2": "3",
    "deepseek-chat": "3",
    "digilab pro": "4",
    "digilab-pro": "4",
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
    user_id: Optional[str] = None

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
    user_id: Optional[str] = None

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
    user_id: Optional[str] = None

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
        print("Sarvam speech client initialized successfully")
    except Exception as e:
        sarvam_client = None
        print(f"Sarvam speech client unavailable: {e}")

    db_ok = check_db_connection()
    if db_ok:
        print("MySQL DB connected successfully")
    else:
        print("MySQL DB connection failed - reference links will be unavailable")

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

def apply_requested_model(model_name: Optional[str]) -> None:
    """Accept frontend model labels without passing them into chatbot methods."""
    if not model_name or chatbot is None:
        return

    normalized = model_name.strip().lower()
    model_key = MODEL_ALIASES.get(normalized)

    if not model_key:
        for key, config in AVAILABLE_MODELS.items():
            if normalized in {
                key.lower(),
                config.id.lower(),
                config.display_name.lower(),
            }:
                model_key = key
                break

    if not model_key:
        return

    next_config = AVAILABLE_MODELS[model_key]
    current_config = getattr(chatbot, "model_config", None)
    # Compare the full config, not just `.id` — DigiLab and DigiLab Pro both use
    # id="gemini-2.5-flash" but point at different Pinecone indexes, so an
    # id-only check would wrongly skip switch_model() between them.
    if current_config != next_config:
        chatbot.switch_model(next_config)

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
async def chat(request: QuestionRequest):
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
    print(f"DEBUG: Processing question: {request.question[:30]} | Model: {request.model}")

    try:
        apply_requested_model(request.model)

        # ── 1. Get chatbot answer ──
        # Check if the chatbot object has ask_question_with_follow_ups, 
        # otherwise fallback to ask_question
        if hasattr(chatbot, 'ask_question_with_follow_ups'):
            result = chatbot.ask_question_with_follow_ups(
                question=request.question.strip(),
                use_history=request.use_history if request.use_history is not None else True,
            )
        else:
            result = chatbot.ask_question(
                question=request.question.strip(),
                model=request.model,
                use_history=request.use_history if request.use_history is not None else True,
            )

        # ── 2. Fetch matching reference links from MySQL ──
        ref_links = []
        if result.get("sources"):
            raw_links = find_reference_links(
                sources=result["sources"],
                answer=result.get("answer", ""),
                min_score=0.4,
                max_links=5,
            )
            ref_links = [
                ReferenceLink(
                    title=link.get("title", ""),
                    url=link.get("url", ""),
                    relevance_score=link.get("relevance_score", 0.0),
                )
                for link in raw_links
            ]

        # ── 3. Build response ──
        chat_response = {
            "answer": result["answer"],
            "sources": result["sources"],
            "expanded_queries": result.get("expanded_queries", []),
            "validation": result.get("validation"),
            "metadata": build_metadata(result, ref_links),
            "reference_links": ref_links,
            "follow_up_questions": result.get("follow_up_questions"),
        }

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
            has_sources=has_sources,
            user_id=request.user_id or "guest"
        )

        return chat_response

    except Exception as e:
        duration_ms = (time.perf_counter() - start_time) * 1000
        log_request_metrics(
            endpoint="/chat",
            status_code=500,
            response_time_ms=duration_ms,
            model=request.model or "1",
            user_id=request.user_id or "guest"
        )
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.get("/metrics/summary")
async def metrics_summary(window: str = "30d", user_id: Optional[str] = None):
    """Get aggregated metrics for the dashboard."""
    return get_metrics_summary(window=window, user_id=user_id)


@app.post("/chat/simple")
async def chat_simple(request: QuestionRequest):
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

    try:
        if request.language_code:
            language_code = _normalize_lang_for_tts(request.language_code)
        else:
            language_code = sarvam_client.detect_language(request.question)

        question = request.question.strip()

        # Step 1: Translate question to English (skip if already English)
        if language_code == "en-IN":
            english_question = question
        else:
            english_question = sarvam_client.translate(
                text=question,
                target_language_code="en-IN",
                source_language_code=language_code,
            )

        # Step 2: RAG pipeline
        result = chatbot.ask_question(
            question=english_question,
            use_history=request.use_history if request.use_history is not None else True,
        )

        english_answer = result.get("answer", "")
        if not english_answer.strip():
            raise HTTPException(status_code=500, detail="Generated answer is empty")

        # Step 3: Translate answer back to user's language (skip if English)
        if language_code == "en-IN":
            translated_answer = english_answer
        else:
            translated_answer = sarvam_client.translate(
                text=english_answer,
                target_language_code=language_code,
                source_language_code="en-IN",
            )

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

    except Exception as e:
        log_request_metrics(
            endpoint="/text-to-text",
            status_code=500,
            response_time_ms=0,
            user_id=request.user_id or "guest"
        )
        raise HTTPException(status_code=500, detail=f"Error processing text: {str(e)}")


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

    try:
        decode_start = time.perf_counter()
        audio_bytes = _decode_audio_b64(request.audio_base64)
        decode_ms = round((time.perf_counter() - decode_start) * 1000, 2)

        # ── Audio size check ──
        if len(audio_bytes) > MAX_AUDIO_BYTES:
            raise HTTPException(status_code=413, detail="Audio too long. Max ~30 seconds allowed.")

        # Step 1: Transcribe
        stt_start = time.perf_counter()
        transcript, detected_language = sarvam_client.speech_to_text_bytes(
            audio_bytes=audio_bytes,
            mime_type=request.mime_type or "audio/wav",
        )
        stt_ms = round((time.perf_counter() - stt_start) * 1000, 2)

        if not transcript.strip():
            raise HTTPException(status_code=400, detail="No speech detected in audio")

        # Step 2: Get chat answer
        chat_start = time.perf_counter()
        result = chatbot.ask_question(
            question=transcript.strip(),
            use_history=request.use_history if request.use_history is not None else True,
        )
        chat_ms = round((time.perf_counter() - chat_start) * 1000, 2)

        answer = result.get("answer", "")
        if not answer.strip():
            raise HTTPException(status_code=503, detail="Question is outside course material")

        # Step 3: Generate response audio
        response_language = _normalize_lang_for_tts(request.response_language_code or detected_language)

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

    except Exception as e:
        log_request_metrics(
            endpoint="/speech-to-speech",
            status_code=500,
            response_time_ms=0,
            user_id=request.user_id or "guest"
        )
        raise HTTPException(status_code=500, detail=f"Speech processing failed: {str(e)}")

# ─────────────────────────────────────────────────────────────
# Run
# ─────────────────────────────────────────────────────────────

if __name__ == "__main__":
    if not os.path.exists("data/processed/txt_processed.flag"):
        print("\nTXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        exit(1)

    print("\n" + "=" * 60)
    print("Starting Media Literacy Chatbot API Server")
    print("=" * 60)
    print("API:  http://localhost:8000")
    print("Docs: http://localhost:8000/docs")
    print("=" * 60 + "\n")

    reload_enabled = os.getenv("UVICORN_RELOAD", "false").lower() == "true"
    uvicorn.run("api_server:app", host="localhost", port=8000, reload=reload_enabled, log_level="info")
