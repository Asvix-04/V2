"""
api_server.py — FastAPI server for Media Literacy Chatbot.

Includes MySQL reference link lookup after every answer (Crash-proof version).
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
import os
from dotenv import load_dotenv

# Make sure this matches your Gemini backend filename (e.g., chatbot_1.py or chatbot.py)
from chatbot import PDFChatbot

# ── NEW: Crash-proof Database Import ──
# This stops the server from crashing if Db.py is missing or named db.py
try:
    from Db import find_reference_links, check_db_connection
except ImportError:
    try:
        from db import find_reference_links, check_db_connection
    except ImportError:
        print("⚠️ WARNING: Could not find 'Db.py'. MySQL reference links will be disabled, but chat will work!")
        def check_db_connection():
            return False
        def find_reference_links(*args, **kwargs):
            return []

load_dotenv()

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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatbot = None

# ─────────────────────────────────────────────────────────────
# Pydantic Models
# ─────────────────────────────────────────────────────────────

class QuestionRequest(BaseModel):
    question: str
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
    reference_links: List[ReferenceLink] = []   # ← NEW

class HealthResponse(BaseModel):
    status: str
    message: str
    db_connected: bool                          # ← NEW

# ─────────────────────────────────────────────────────────────
# Startup
# ─────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    global chatbot
    try:
        chatbot = PDFChatbot()
        print("✅ Chatbot initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing chatbot: {e}")
        raise

    db_ok = check_db_connection()
    if db_ok:
        print("✅ MySQL DB connected successfully")
    else:
        print("⚠️ MySQL DB connection failed or missing — reference links will be unavailable")

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
    db_ok = check_db_connection()
    return {
        "status": "healthy",
        "message": "Media Literacy Chatbot API is running",
        "db_connected": db_ok,
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: QuestionRequest):
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        # ── 1. Get chatbot answer ──
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history,
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
                    title=link["title"],
                    url=link["url"],
                    relevance_score=link["relevance_score"],
                )
                for link in raw_links
            ]

        # ── 3. Build response ──
        return {
            "answer": result["answer"],
            "sources": result["sources"],
            "expanded_queries": result.get("expanded_queries", []),
            "validation": result.get("validation"),
            "metadata": build_metadata(result, ref_links),
            "reference_links": ref_links,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/chat/simple")
async def chat_simple(request: QuestionRequest):
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    try:
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history,
        )

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
                    title=link["title"],
                    url=link["url"],
                    relevance_score=link["relevance_score"],
                )
                for link in raw_links
            ]

        return {
            "answer": result["answer"],
            "reference_links": ref_links,
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


@app.post("/chat/explain-selection")
async def explain_selection(request: SelectionRequest):
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


if __name__ == "__main__":
    # if not os.path.exists("data/processed/txt_processed.flag"):
    #     print("\n❌ TXT file not processed yet!")
    #     print("Please run: python process_txt_pipeline.py")
    #     exit(1)

    print("\n" + "=" * 60)
    print("🚀 Starting Media Literacy Chatbot API Server")
    print("=" * 60)
    print("📡 API:  http://localhost:8000")
    print("📚 Docs: http://localhost:8000/docs")
    print("=" * 60 + "\n")

    filename = os.path.basename(__file__).replace(".py", "")
    uvicorn.run(f"{filename}:app", host="localhost", port=8000, reload=True, log_level="info")