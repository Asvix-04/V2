# DigiLab Pipeline Setup Guide

This guide explains how to set up and run the full stack: React Frontend, Node.js Backend, and Python RAG Engine.

## Prerequisites
- **Node.js**: v18+ 
- **Python**: v3.10+
- **Neo4j & Pinecone**: (Optional - see "Mock Mode")

---

## 1. Python RAG Backend (`Backend_chatbot`)
This service handles the academic document search.

1. **Navigate to the folder**:
   ```bash
   cd Backend_chatbot
   ```
2. **Install dependencies**:
   ```bash
   pip install -r req.txt
   ```
3. **Set up Environment**:
   Create a `.env` file with your **Pinecone** and **Neo4j** credentials.
4. **Run the server**:
   ```bash
   python api_server.py
   ```
   *The server will run at: `http://localhost:8000`*

---

## 2. Node.js Main Backend (`crypt/backend`)
This service bridges the frontend to the AI services.

1. **Navigate to the folder**:
   ```bash
   cd crypt/backend
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Set up Environment**:
   Ensure `.env` contains:
   - `VITE_GEMINI_API_KEY`: (For Voice Processing)
   - `PYTHON_BACKEND_URL=http://localhost:8000`
4. **Run the server**:
   ```bash
   npm run dev
   ```
   *The server will run at: `http://localhost:5001`*

---

## 3. React Frontend (`crypt`)
The user interface.

1. **Navigate to the root**:
   ```bash
   cd crypt
   ```
2. **Install dependencies**:
   ```bash
   npm install
   ```
3. **Run the app**:
   ```bash
   npm run dev
   ```
   *The app will be available at: `http://localhost:5173`*

---

## Testing Speech-to-Speech
1. Start all **3 servers** as described above.
2. Open `http://localhost:5173/chat`.
3. Click the **Microphone icon**.
4. Speak a question (e.g., "Tell me about media literacy").
5. The system will:
   - Capture your voice.
   - Send it to Node (5001).
   - Node will bridge to Python (8000) for the answer.
   - Node will return the final academic response.

---

## Troubleshooting
- **404 on /chat**: Ensure the Python server is active on port 8000.
- **Microphone Error**: Ensure you are using `localhost` (browsers block mics on non-HTTPS sites unless they are local).
- **RESEND_API_KEY Missing**: This only affects the Contact form, the chat will still work.
