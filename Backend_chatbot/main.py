"""
main.py — Media Literacy Chatbot.

Run as API server:  uvicorn main:app --reload
Run as CLI:         python main.py --cli
"""

import os
import sys
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
from chatbot import PDFChatbot
from Db import find_reference_links, check_db_connection

load_dotenv()

# FastAPI App

app = FastAPI(
    title="Media Literacy Chatbot API",
    description="API for the Media Literacy Course Chatbot with reference links",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

chatbot = None

# Pydantic Models

class QuestionRequest(BaseModel):
    question: str
    use_history: Optional[bool] = True

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

class HealthResponse(BaseModel):
    status: str
    message: str
    db_connected: bool

# Helpers

def check_txt_processing():
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

def print_detailed_sources(sources):
    print("\n" + "=" * 70)
    print("📚 SOURCES USED:")
    print("=" * 70)
    for i, source in enumerate(sources, 1):
        print(f"\n{i}. Section: {source.get('full_section', 'Unknown')}")
        print(f"   File: {source.get('source_file', 'N/A')}")
        print(f"   Page: {source.get('page', 'N/A')}")
        print(f"   Preview: {source.get('text', '')[:100]}...")
    print("=" * 70)

# Startup


@app.on_event("startup")
async def startup_event():
    global chatbot
    try:
        chatbot = PDFChatbot()
        print("✅ Chatbot initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing chatbot: {e}")
        raise

    if check_db_connection():
        print("✅ MySQL DB connected successfully")
    else:
        print("⚠️  MySQL DB unavailable — reference links will be skipped")


# Routes


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
        "db_connected": check_db_connection(),
    }


@app.post("/chat", response_model=ChatResponse)
async def chat(request: QuestionRequest):
    """Full response: answer + sources + validation + reference links."""
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
        answer_text = result.get("answer", "")
        is_out_of_scope = "outside the scope" in answer_text.lower() or "outside of the scope" in answer_text.lower()

        if result.get("sources") and not is_out_of_scope:
            raw_links = find_reference_links(
                sources=result["sources"],
                answer=answer_text,
                min_score=0.5,
                max_links=5,
            )
            ref_links = [ReferenceLink(url=link["url"], clickable=link["clickable"]) for link in raw_links]

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

        ref_links = []
        answer_text = result.get("answer", "")
        is_out_of_scope = "outside the scope" in answer_text.lower() or "outside of the scope" in answer_text.lower()

        if result.get("sources") and not is_out_of_scope:
            ref_links = find_reference_links(
                sources=result["sources"],
                answer=answer_text,
                min_score=0.5,
                max_links=5,
            )

        return {"answer": result["answer"], "reference_links": ref_links}

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")


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
        return {"history": chatbot.conversation_history, "count": len(chatbot.conversation_history)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")


# CLI Mode


def run_cli():
    print("=" * 60)
    print("📖 Media Literacy Course Chatbot — CLI Mode")
    print("=" * 60)

    if not check_txt_processing():
        print("\n❌ TXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        return

    print("✅ Using existing knowledge base...")

    db_ok = check_db_connection()
    if db_ok:
        print("✅ MySQL DB connected — reference links enabled")
    else:
        print("⚠️  MySQL DB unavailable — reference links disabled")

    try:
        cli_chatbot = PDFChatbot()
    except Exception as e:
        print(f"\n❌ Error initializing chatbot: {e}")
        return

    print("\n" + "=" * 60)
    print("💬 Chatbot Ready!")
    print("=" * 60)
    print("  • Type your question to get an answer")
    print("  • Type 'sources' to see detailed source info")
    print("  • Type 'clear' to clear conversation history")
    print("  • Type 'quit' to exit")
    print("=" * 60 + "\n")

    last_result = None

    while True:
        try:
            question = input("\n🎓 You: ").strip()

            if question.lower() == "quit":
                print("👋 Goodbye!")
                break
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
            result = cli_chatbot.ask_question(question)
            last_result = result

            # Print answer
            print("\n" + "=" * 70)
            print("🤖 Assistant:")
            print("=" * 70)
            print(result["answer"])
            print("=" * 70)

            # Print source summary
            if result["sources"]:
                print(f"\n📚 Based on {len(result['sources'])} source section(s)")
                unique_sections = list(set([
                    s.get("full_section", "Unknown")[:50]
                    for s in result["sources"]
                ]))
                print("   Sections referenced:")
                for i, section in enumerate(unique_sections[:3], 1):
                    print(f"   {i}. {section}...")
            else:
                print("\n⚠️  No relevant sources found")

            # ── Print reference links ──
            if db_ok and result.get("sources"):
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
                        print(f"\n{i}. {link['title']}")
                        print(f"   {link['url']}")
                        print(f"   Relevance: {link['relevance_score']:.0%}")
                    print("=" * 70)
                else:
                    print("\n📎 No matching reference links found for this topic.")

        except KeyboardInterrupt:
            print("\n\n👋 Goodbye!")
            break
        except Exception as e:
            print(f"\n❌ Error: {e}")
            import traceback
            traceback.print_exc()


# Entry Point


if __name__ == "__main__":
    if "--cli" in sys.argv:
        run_cli()
    else:
        if not check_txt_processing():
            print("\n❌ TXT file not processed yet!")
            print("Please run: python process_txt_pipeline.py")
            sys.exit(1)

        print("\n" + "=" * 60)
        print("🚀 Starting Media Literacy Chatbot API Server")
        print("=" * 60)
        print("📡 API:  http://localhost:8000")
        print("📚 Docs: http://localhost:8000/docs")
        print("=" * 60 + "\n")

        uvicorn.run("main:app", host="localhost", port=8000, reload=True, log_level="info")
