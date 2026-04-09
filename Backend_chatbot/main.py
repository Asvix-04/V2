"""
main.py — Digilab Media Literacy Chatbot.

Merged version combining:
- Downloads main.py      (CLI with follow-up questions, ask_question_with_follow_ups)
- worker/main.py         (FastAPI API + CLI combined, model-switch API routes, reference links)

Run as API server:  python main.py
                    uvicorn main:app --reload
Run as CLI:         python main.py --cli
"""

import os
import sys
import base64
import binascii
import time
from datetime import datetime
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
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
# FastAPI App
# ─────────────────────────────────────────────────────────────

app = FastAPI(
    title="Digilab — Media Literacy Chatbot API",
    description="API for the IGNOU Media Literacy Course Chatbot with reference links",
    version="3.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatbot = None
sarvam_client = None

# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
    use_history: Optional[bool] = True

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
    current_model: str

class SelectionRequest(BaseModel):
    selected_text: str        # The text the user highlighted
    full_bot_message: str     # The full bot answer it came from

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

def is_out_of_scope(answer_text: str) -> bool:
    return "outside the scope" in answer_text.lower() or "outside of the scope" in answer_text.lower()

def get_ref_links(result: dict) -> list:
    """Fetch reference links only for in-scope answers that have sources."""
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
    compact = []
    for source in sources[:5]:
        compact.append({
            "section": source.get("full_section", "Unknown"),
            "file": source.get("source_file", "N/A"),
            "page": source.get("page", "N/A"),
        })
    return compact

def _append_s2s_timing_log(metrics: Dict[str, Any]) -> None:
    try:
        if not os.path.exists(S2S_TIMING_LOG_FILE):
            with open(S2S_TIMING_LOG_FILE, "w", encoding="utf-8") as f:
                f.write(
                    "timestamp | decode_ms | stt_ms | chat_ms | tts_ms | "
                    "encode_ms | total_ms | transcript_chars | answer_chars | "
                    "response_language | detected_language\n"
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
            f"{metrics.get('detected_language', '')}\n"
        )
        with open(S2S_TIMING_LOG_FILE, "a", encoding="utf-8") as f:
            f.write(line)
    except Exception as e:
        print(f"Timing log write failed: {e}")

def print_detailed_sources(sources: list):
    print("\n" + "=" * 70)
    print("📚 SOURCES USED:")
    print("=" * 70)
    for i, source in enumerate(sources, 1):
        print(f"\n{i}. Section: {source.get('full_section', 'Unknown')}")
        print(f"   File: {source.get('source_file', 'N/A')}")
        print(f"   Page: {source.get('page', 'N/A')}")
        print(f"   Preview: {source.get('text', '')[:100]}...")
    print("=" * 70)

def print_follow_up_questions(follow_up_questions):
    """Print follow-up questions and return selectable options."""
    if not follow_up_questions:
        return {}

    type_2 = follow_up_questions.get("type_2_context_aware", [])
    status = follow_up_questions.get("status", "unknown")

    if not type_2:
        return {}

    print("\n" + "=" * 70)
    print("💡 Follow-up Questions:")
    print("=" * 70)
    if type_2:
        print("\nFollow-up (type the number to ask instantly):")
        for i, question in enumerate(type_2, 1):
            print(f"  {i}. {question}")
    print(f"\n   Status: {status}")
    print("=" * 70)
    return {str(i): question for i, question in enumerate(type_2, 1)}

# ─────────────────────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    global chatbot, sarvam_client
    try:
        chatbot = PDFChatbot()
        print(f"✅ Chatbot initialized — model: {chatbot.model_config.display_name}")
    except Exception as e:
        print(f"❌ Error initializing chatbot: {e}")
        raise

    try:
        sarvam_client = SarvamClient()
        print("✅ Sarvam speech client initialized")
    except Exception as e:
        sarvam_client = None
        print(f"⚠️  Sarvam speech client unavailable: {e}")

    if check_db_connection():
        print("✅ MySQL DB connected — reference links enabled")
    else:
        print("⚠️  MySQL DB unavailable — reference links will be skipped")

# ─────────────────────────────────────────────────────────────
# Routes
# ─────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {
        "message": "Digilab Media Literacy Chatbot API is running",
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthResponse)
async def health_check():
    return {
        "status": "healthy",
        "message": "Digilab Media Literacy Chatbot API is running",
        "db_connected": check_db_connection(),
        "current_model": chatbot.model_config.display_name if chatbot else "Not initialized",
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: QuestionRequest):
    """Full response: answer + sources + validation + reference links."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        result = chatbot.ask_question_with_follow_ups(
            question=request.question.strip(),
            use_history=request.use_history,
        )

        raw_links = get_ref_links(result)
        ref_links = [ReferenceLink(url=l["url"], clickable=l["clickable"]) for l in raw_links]

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
async def chat_simple(request: QuestionRequest):
    """Lightweight: answer text + reference links only."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history,
        )

        ref_links = get_ref_links(result)
        return {"answer": result["answer"], "reference_links": ref_links}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/chat/explain-selection")
async def explain_selection(request: SelectionRequest):
    """
    Explain a specific part of a bot answer that the user highlighted.

    The frontend sends:
      - selected_text:    the exact highlighted snippet
      - full_bot_message: the full bot answer it came from

    Returns a focused explanation of the selected snippet.
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
        return result  # {"explanation": "..."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating explanation: {str(e)}")


@app.post("/model/switch")
async def switch_model(request: ModelSwitchRequest):
    """Switch the active LLM model. Keys: '1' = Gemini Flash, '2' = Gemini Pro, '3' = Claude Haiku."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if request.model_key not in AVAILABLE_MODELS:
        raise HTTPException(status_code=400, detail=f"Invalid model key. Use '1', '2', or '3'.")

    new_config = AVAILABLE_MODELS[request.model_key]
    chatbot.switch_model(new_config)
    return {
        "status": "success",
        "message": f"Switched to {new_config.display_name}",
        "model": new_config.display_name,
    }


@app.get("/model/current")
async def get_current_model():
    """Get the currently active model."""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    return {
        "model": chatbot.model_config.display_name,
        "description": chatbot.model_config.description,
    }


@app.get("/model/available")
async def get_available_models():
    """List all available models."""
    return {
        "models": [
            {"key": k, "name": v.display_name, "description": v.description}
            for k, v in AVAILABLE_MODELS.items()
        ]
    }


@app.post("/clear-history")
async def clear_history():
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    try:
        chatbot.clear_history()
        return {"status": "success", "message": "Conversation history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")


@app.get("/history")
async def get_history():
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    try:
        return {
            "history": chatbot.conversation_history,
            "count": len(chatbot.conversation_history),
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

    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too long. Max ~30 seconds allowed.")

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
        raise HTTPException(status_code=500, detail="Generated answer is empty")

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
# CLI Mode
# ─────────────────────────────────────────────────────────────

def select_model() -> ModelConfig:
    """Show model selection menu and return chosen ModelConfig."""
    print("\nSelect AI Model:")
    print("  [1] ⚡ Gemini Flash    — Default (Fast, cost-efficient)")
    print("  [2] 🔬 Gemini Pro      — Research (High context, deep reasoning)")
    print("  [3] 🎯 Claude Haiku    — Fast & accurate (Anthropic)")
    print()
    while True:
        choice = input("Enter choice (1-3) [default: 1]: ").strip()
        if choice == "":
            choice = "1"
        if choice in AVAILABLE_MODELS:
            model = AVAILABLE_MODELS[choice]
            print(f"\n✅ Selected: {model.description}")
            return model
        print("  ⚠️  Invalid choice. Enter 1, 2, or 3.")


def run_cli():
    print("=" * 60)
    print("📖 Digilab — Media Literacy Course Chatbot")
    print("=" * 60)

    if not check_txt_processing():
        print("\n❌ TXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        print("First, make sure your TXT files are in: data/txts/")
        return

    print("✅ Using existing knowledge base...")

    db_ok = check_db_connection()
    if db_ok:
        print("✅ MySQL DB connected — reference links enabled")
    else:
        print("⚠️  MySQL DB unavailable — reference links disabled")

    # Model selection at startup
    model_config = select_model()

    try:
        cli_chatbot = PDFChatbot(model_config=model_config)
    except Exception as e:
        print(f"\n❌ Error initializing chatbot: {e}")
        return

    print("\n" + "=" * 60)
    print("💬 Chatbot Ready!")
    print("=" * 60)
    print("\nCommands:")
    print("  • Type your question to get an answer")
    print("  • Type 'model' to switch AI model")
    print("  • Type 'sources' to see detailed source info from last answer")
    print("  • Type 'clear' to clear conversation history")
    print("  • Type 'quit' to exit")
    print("=" * 60 + "\n")

    last_result = None
    follow_up_option_map = {}

    while True:
        try:
            question = input(f"\n🎓 You [{cli_chatbot.model_config.display_name}]: ").strip()

            if question.lower() == "quit":
                print("👋 Goodbye!")
                break

            # Quick-select a follow-up by number
            if question in follow_up_option_map:
                selected = follow_up_option_map[question]
                print(f"\n🔗 Asking follow-up: {selected}")
                question = selected

            if question.lower() == "model":
                new_config = select_model()
                cli_chatbot.switch_model(new_config)
                print(f"✅ Switched to {new_config.display_name}")
                continue

            if question.lower() == "clear":
                cli_chatbot.clear_history()
                print("✅ Conversation history cleared!")
                continue

            if question.lower() == "sources" and last_result:
                print_detailed_sources(last_result["sources"])
                continue

            if not question:
                continue

            print("\n🤔 Thinking...")
            result = cli_chatbot.ask_question_with_follow_ups(question)
            last_result = result

            # Print answer
            print("\n" + "=" * 70)
            print("🤖 Assistant:")
            print("=" * 70)
            print(result["answer"])
            print("=" * 70)

            # Source summary
            if result["sources"]:
                print(f"\n📚 Answer based on {len(result['sources'])} section(s)")
                print("   Type 'sources' to see detailed source information")
                unique_sections = list(set([
                    s.get("full_section", "Unknown")[:50]
                    for s in result["sources"]
                ]))
                print("\n   Sections referenced:")
                for i, section in enumerate(unique_sections[:3], 1):
                    print(f"   {i}. {section}...")
            else:
                print("\n⚠️  No relevant sources found - answer may be incomplete")

            # Reference links
            if db_ok and result.get("sources") and not is_out_of_scope(result.get("answer", "")):
                ref_links = find_reference_links(
                    sources=result["sources"],
                    answer=result.get("answer", ""),
                    min_score=0.5,
                    max_links=5,
                )
                if ref_links:
                    print("\n" + "=" * 70)
                    print("🔗 REFERENCE LINKS:")
                    print("=" * 70)
                    for i, link in enumerate(ref_links, 1):
                        print(f"\n{i}. {link['url']}")
                    print("=" * 70)

            # Follow-up questions
            follow_up_option_map = print_follow_up_questions(result.get("follow_up_questions", {}))

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
        print("🚀 Starting Digilab API Server")
        print("=" * 60)
        print("📡 API:  http://localhost:8000")
        print("📚 Docs: http://localhost:8000/docs")
        print("=" * 60 + "\n")

        uvicorn.run("main:app", host="localhost", port=8000, reload=True, log_level="info")
