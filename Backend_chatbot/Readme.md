# Media Literacy Chatbot - Flask Backend

A production-ready Flask API for the IGNOU Media Literacy Course Chatbot.

## Endpoints

| Method | Path          | Description                                   |
|--------|---------------|-----------------------------------------------|
| GET    | /health       | Health check returns status ok                |
| POST   | /chat         | Full chat with sources and metadata           |
| POST   | /chat/simple  | Simple chat returns only the answer text      |

### POST /chat

Request:
```json
{
  "message": "What is media literacy?",
  "options": {
    "use_history": true
  }
}
```

Response:
```json
{
  "reply": "Media literacy is...",
  "sources": [
    {
      "full_section": "Unit 1 > Introduction",
      "page": "5",
      "source_file": "course.pdf",
      "text": "..."
    }
  ],
  "meta": {
    "total_sources": 3,
    "unique_sections": 2,
    "completeness_score": 8,
    "content_sufficient": true,
    "query_expanded": true,
    "top_sources": []
  }
}
```

## Environment Variables

Create a `.env` file (or set these in your environment):

| Variable             | Required | Description                                      |
|----------------------|----------|--------------------------------------------------|
| `GEMINI_API_KEY`     | Yes      | Google Gemini API key                            |
| `PINECONE_API_KEY`   | Yes      | Pinecone API key                                 |
| `PINECONE_ENVIRONMENT` | No     | Pinecone region (default: `us-east-1`)           |
| `NEO4J_URI`          | Yes      | Neo4j connection URI (e.g., `bolt://localhost:7687`) |
| `NEO4J_USERNAME`     | Yes      | Neo4j username                                   |
| `NEO4J_PASSWORD`     | Yes      | Neo4j password                                   |
| `NEO4J_DATABASE`     | No       | Neo4j database name (default: `neo4j`)           |
| `PORT`               | No       | Server port (default: `7860`)                    |

**Example `.env`:**
```
GEMINI_API_KEY=your-gemini-key
PINECONE_API_KEY=your-pinecone-key
PINECONE_ENVIRONMENT=us-east-1
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password
NEO4J_DATABASE=neo4j
PORT=7860
```

## Local Development

### 1. Create and activate a virtual environment

Windows:
python -m venv .venv
.venv\Scripts\activate

# macOS / Linux
python3 -m venv .venv
source .venv/bin/activate
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Set environment variables

Copy the example above into a .env file and fill in your credentials.

### 4. Run the development server

Windows:
```
set PORT=7860
python app.py
```

macOS / Linux:
```
export PORT=7860
python app.py
```

### 5. Test the endpoints

Health check:
curl http://localhost:7860/health

# Chat
curl -X POST http://localhost:7860/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"What is media literacy?\"}"

# Simple chat
curl -X POST http://localhost:7860/chat/simple \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"hi\"}"
```

---

## Running Tests

```
pytest tests/test_api.py -v
```

With coverage:
```
pytest tests/test_api.py -v --cov=app --cov-report=term-missing
```

## Docker

### Build the image

```
docker build -t backend_chatbot:latest .
```

### Run the container

```
docker run --rm -p 7860:7860 \
  -e GEMINI_API_KEY=your-key \
  -e PINECONE_API_KEY=your-key \
  -e NEO4J_URI=bolt://host.docker.internal:7687 \
  -e NEO4J_USERNAME=neo4j \
  -e NEO4J_PASSWORD=your-password \
  backend_chatbot:latest
```

Or use an env file:

```
docker run --rm -p 7860:7860 --env-file .env backend_chatbot:latest
```

Visit: http://localhost:7860/health

## Deploy to Hugging Face Spaces (Docker)

Hugging Face Spaces supports Docker-based deployments.

### Steps

1. Create a new Space at https://huggingface.co/spaces
   Choose Docker as the runtime (SDK).

2. Clone the Space repo
   ```
   git clone https://huggingface.co/spaces/<your-username>/<space-name>
   cd <space-name>
   ```

3. **Copy files** from `Backend_chatbot/` into the Space repo:
   - `app.py`
   Copy files from Backend_chatbot/ into the Space repo:
   - app.py
   - chatbot.py
   - hybrid_retriever.py
   - pinecone_client.py
   - neo4j_client.py
   - query_expander.py
   - requirements.txt
   - Dockerfile
   - .dockerignore
   - Any other .py files needed

4. Set Secrets in the Space settings (Settings, Variables and secrets):
   - GEMINI_API_KEY
   - PINECONE_API_KEY
   - NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD

5. Commit and push
   ```mit -m "Add Flask chatbot with Docker"
   git push
   ```

6. **Monitor the build** on the Space page. Once successful, your API is live at:
   ```
   Monitor the build on the Space page. Once successful, your API is live at:
   ```
   https://<your-username>-<space-name>.hf.space/health
   ```

Note: Hugging Face Spaces default to showing a UI. Docker runtime supports headless APIs, but you may optionally add a simple HTML index.html or Gradio/Streamlit UI for better user experience.

## Git Workflow (Suggested)

Create feature branch:
# Stage and commit
git
git checkout -b feat/flask-server
```

Stage and commit:
```
git add Backend_chatbot/app.py Backend_chatbot/requirements.txt \
        Backend_chatbot/Dockerfile Backend_chatbot/.dockerignore \
        Backend_chatbot/tests/test_api.py Backend_chatbot/Readme.md

git commit -m "feat(backend): add Flask API with Docker support

- Add Flask app.py with /health, /chat, /chat/simple endpoints
- Add requirements.txt with Flask, gunicorn, and dependencies
- Add Dockerfile for production deployment
- Add .dockerignore for smaller images
- Add pytest tests for API endpoints
- Add README with local, Docker, and HF Spaces instructions"
```

Push to remote:
```
git push -u origin feat/flask-server
```kend_chatbot/
├── app.py              # Flask application (entry point)
├── chatbot.py          # PDFChatbot class (business logic)
├── hybrid_retriever.py # Hybrid retrieval (Pinecone + Neo4j)
├── pinecone_client.py  # Pinecone vector search client
├── neo4j_
├── chatbot.py
├── hybrid_retriever.py
├── pinecone_client.py
├── neo4j_client.py
├── query_expander.py
├── requirements.txt
├── Dockerfile
├── .dockerignore
├── Readme.md
└── tests/
    └── test_api.py
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| GEMINI_API_KEY not found | Ensure .env file exists and contains GEMINI_API_KEY |
| Connection refused to Neo4j | Check NEO4J_URI and that Neo4j is running |
| Docker host.docker.internal not working | On Linux use actual IP or --network host |
| Tests fail with import errors | Run pip install -r requirements.txt | the repository root for license information.

