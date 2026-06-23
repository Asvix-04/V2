"""
streaming_endpoint.py — Digilab Streaming API Endpoint (FastAPI)

Usage:
    uvicorn streaming_endpoint:app --reload --port 8001
"""

from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from chatbot import PDFChatbot

app = FastAPI(title="Digilab Streaming API")

# ── CORS (adjust origins for production) ──
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET"],
    allow_headers=["*"],
)

# ── Single chatbot instance (shared across requests) ──
chatbot = PDFChatbot()


def token_generator(question: str):
    """
    Wraps ask_question_stream and formats each chunk
    as an SSE (Server-Sent Events) message.
    """
    try:
        for token in chatbot.ask_question_stream(question):
            # SSE format: "data: <token>\n\n"
            yield f"data: {token}\n\n"
    except Exception as e:
        yield f"data: Error: {str(e)}\n\n"
    finally:
        # Signal to frontend that stream is complete
        yield "data: [DONE]\n\n"


@app.get("/stream")
async def stream_answer(q: str = Query(..., description="Student's question")):
    """
    SSE endpoint — streams answer token by token.

    Example:
        GET /stream?q=what+is+media+literacy
    """
    return StreamingResponse(
        token_generator(q),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",  # Nginx buffering disable
        },
    )


@app.get("/health")
async def health():
    return {"status": "ok", "model": chatbot.model_config.display_name}
