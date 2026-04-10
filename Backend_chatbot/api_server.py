from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import uvicorn
from chatbot import PDFChatbot
import os
from dotenv import load_dotenv

load_dotenv()

# Initialize FastAPI app
app = FastAPI(
    title="Media Literacy Chatbot API",
    description="API for the Media Literacy Course Chatbot",
    version="1.0.0"
)

# Add CORS middleware to allow frontend to call the API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, replace with specific frontend URL
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize chatbot instance
chatbot = None

# Request/Response models
class QuestionRequest(BaseModel):
    question: str
    use_history: Optional[bool] = True

class Source(BaseModel):
    section_id: Optional[str] = None
    title: Optional[str] = None
    full_section: Optional[str] = None
    level: Optional[str] = None
    parent_id: Optional[str] = None
    page: Optional[str] = None
    chunk_index: Optional[str] = None
    source_file: Optional[str] = None
    text: Optional[str] = None

class ValidationInfo(BaseModel):
    completeness_score: Optional[int] = None
    can_fully_answer: Optional[bool] = None
    topic_directly_discussed: Optional[bool] = None
    substantial_content_present: Optional[bool] = None
    reasoning: Optional[str] = None
    what_is_available: Optional[str] = None
    what_is_missing: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    sources: List[Dict[str, Any]]
    expanded_queries: List[str]
    validation: Optional[Dict[str, Any]] = None
    # Additional metadata about the retrieval process
    metadata: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    message: str

# Startup event to initialize chatbot
@app.on_event("startup")
async def startup_event():
    global chatbot
    try:
        chatbot = PDFChatbot()
        print("✅ Chatbot initialized successfully")
    except Exception as e:
        print(f"❌ Error initializing chatbot: {e}")
        raise

# Health check endpoint
@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Check if the API is running"""
    return {
        "status": "healthy",
        "message": "Media Literacy Chatbot API is running"
    }

# Main chat endpoint
@app.post("/chat", response_model=ChatResponse)
async def chat(request: QuestionRequest):
    """
    Send a question to the chatbot and get an answer
    
    - **question**: The question to ask
    - **use_history**: Whether to use conversation history (default: True)
    """
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    try:
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history
        )
        
        # Build enhanced metadata
        metadata = {
            "total_sources": len(result['sources']),
            "unique_sections": len(set([s.get('full_section', '') for s in result['sources']])),
            "completeness_score": result.get('validation', {}).get('completeness_score', None),
            "content_sufficient": result.get('validation', {}).get('completeness_score', 0) >= 7,
            "query_expanded": len(result.get('expanded_queries', [])) > 1,
            "top_sources": [
                {
                    "section": s.get('full_section', 'Unknown')[:80],
                    "page": s.get('page', 'N/A'),
                    "file": s.get('source_file', 'N/A')
                }
                for s in result['sources'][:3]  # Top 3 sources
            ]
        }
        
        return {
            "answer": result['answer'],
            "sources": result['sources'],
            "expanded_queries": result.get('expanded_queries', []),
            "validation": result.get('validation', None),
            "metadata": metadata
        }
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")

# Simple chat endpoint - returns only answer text (like terminal)
@app.post("/chat/simple")
async def chat_simple(request: QuestionRequest):
    """
    Send a question and get ONLY the answer text (no metadata)
    
    This endpoint returns just the answer string, like the terminal version.
    Use this if you only need the answer text and don't need sources/metadata.
    
    - **question**: The question to ask
    - **use_history**: Whether to use conversation history (default: True)
    """
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    
    if not request.question or not request.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")
    
    try:
        result = chatbot.ask_question(
            question=request.question.strip(),
            use_history=request.use_history
        )
        
        # Return ONLY the answer text
        return {"answer": result['answer']}
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing question: {str(e)}")

# Clear conversation history endpoint
@app.post("/clear-history")
async def clear_history():
    """Clear the conversation history"""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    
    try:
        chatbot.clear_history()
        return {"status": "success", "message": "Conversation history cleared"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error clearing history: {str(e)}")

# Get conversation history endpoint
@app.get("/history")
async def get_history():
    """Get the current conversation history"""
    if chatbot is None:
        raise HTTPException(status_code=503, detail="Chatbot not initialized")
    
    try:
        return {
            "history": chatbot.conversation_history,
            "count": len(chatbot.conversation_history)
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error retrieving history: {str(e)}")
    
@app.get("/")
async def root():
    return {
        "message": "Media Literacy Chatbot API is running",
        "docs": "/docs",
        "health": "/health"
    }


# Run the server
if __name__ == "__main__":
    # Check if data is processed
    if not os.path.exists("data/processed/txt_processed.flag"):
        print("\n❌ TXT file not processed yet!")
        print("Please run: python process_txt_pipeline.py")
        print("First, make sure your TXT files are in: data/txts/")
        exit(1)
    
    print("\n" + "="*60)
    print("🚀 Starting Media Literacy Chatbot API Server")
    print("="*60)
    print("\n📡 API will be available at: http://localhost:8000")
    print("📚 API Documentation: http://localhost:8000/docs")
    print("📊 Alternative docs: http://localhost:8000/redoc")
    print("\n" + "="*60 + "\n")
    
    uvicorn.run(app, host="localhost", port=8000, log_level="info")