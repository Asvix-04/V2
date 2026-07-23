# `/deepchat` — Walkthrough

I have successfully built and verified the `/deepchat` deep research endpoint. All 5 layers of the deep research architecture have been implemented. The engine correctly decomposes questions, runs parallel worker retrievals, verifies content, queries the web via Tavily, and synthesizes final answers.

## Changes Made

### 1. New Deep Research Engine
- **File**: [deep_research_engine.py](file:///c:/Users/rahman/Desktop/Backend_chatbot/deep_research_engine.py)
- Implemented **5 layers**:
  1. **Orchestrator**: Splits multi-topic questions (e.g. comparison queries) into 2-3 sub-questions using LLM-based planning. Pass-through for single topics.
  2. **Worker Agents**: Concurrently runs each sub-question through the same pipeline as `/chat` (`chatbot.ask_question()`) to retrieve corpus context, validate sufficiency, and generate sub-answers.
  3. **Verifier**: Reads the confidence score and validation mapping directly from the worker result. Determines if the corpus coverage was sufficient.
  4. **Web Fallback (Tavily)**: Falls back to Tavily search only for sub-questions that failed verification. Results are clearly tagged as `[Web Source]`.
  5. **Synthesizer**: Merges all answers and cites resources appropriately.

### 2. FastAPI Endpoint Addition
- **File**: [api_server.py](file:///c:/Users/rahman/Desktop/Backend_chatbot/api_server.py#L457-L529)
- Added `POST /deepchat` route.
- Defined request and response models:
  ```python
  class DeepChatRequest(BaseModel):
      question: str
      use_history: Optional[bool] = False
      model: Optional[str] = None

  class DeepChatResponse(BaseModel):
      answer: str
      sub_questions: List[str]
      layer_trace: List[Dict[str, Any]]
      sources: List[Dict[str, Any]]
      web_sources: List[Dict[str, Any]]
  ```

### 3. Environment Variable
- **File**: [.env](file:///c:/Users/rahman/Desktop/Backend_chatbot/.env#L27)
- Added `TAVILY_API_KEY` for web fallback.

---

## Verification & Testing

### 1. Re-created Broken `venv`
Re-created the virtual environment targeting Python 3.14 on this machine, installing all dependencies in [req.txt](file:///c:/Users/rahman/Desktop/Backend_chatbot/req.txt) along with missing libraries `google-generativeai` and `openai` (for NVIDIA NIM/DeepSeek fallbacks when hitting Gemini limits).

### 2. Verified Route Works
Fired queries to the backend worker on port `8081`:
- **Single-Topic Query**: `What is photojournalism?`
  - *Result*: Orchestrator detected single-topic, bypassed split. Worker resolved from corpus. Returned successfully with status `200` and verifier score `10`.
- **Comparison Query**: `Compare print journalism and radio journalism`
  - *Result*: Orchestrator split into 2 sub-questions:
    1. `What are the key characteristics of print journalism?` -> Resolved by **Corpus** (score=6)
    2. `What are the key characteristics of radio journalism?` -> Resolved by **Corpus** (score=7)
  - *Synthesis*: Successfully merged into a long-form response (5,418 characters). Correctly fell back to Llama 3.1 8B Instruct when Gemini Flash daily limit was reached.
- **Web Fallback Query**:
  - *Result*: When a sub-topic query is not present in the corpus, it successfully fails verification and queries Tavily, returning results tagged as web sources.
