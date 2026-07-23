# Media Literacy Chatbot — Deep Research (`/deepchat`) Guide

This guide walks you through activating the Python virtual environment, resolving port conflicts with Nginx, running the backend workers, and testing the `/deepchat` route.

---

## 1. Virtual Environment Activation

To activate the virtual environment, open your terminal in the `c:\Users\rahman\Desktop\Backend_chatbot` directory and run:

### **PowerShell (Default)**
```powershell
.\venv\Scripts\Activate.ps1
```
> [!NOTE]
> If you get an execution policy error, run `Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope Process` first, then run activation again.

### **Command Prompt (CMD)**
```cmd
.\venv\Scripts\activate.bat
```

---

## 2. Resolving Nginx Port 80 Bind Error

If you run `.\nginx.exe` and see:
`nginx: [emerg] bind() to 0.0.0.0:80 failed (10013: An attempt was made to access a socket in a way forbidden by its access permissions)`

This means Windows System Process (PID 4) or IIS is already listening on Port 80.

### **Solution 1: Query Workers Directly (Easiest)**
You do **not** need Nginx to test or use `/deepchat`. You can query any of the backend workers directly on their respective ports:
- Worker 1: `http://localhost:8081`
- Worker 2: `http://localhost:8082`
- Worker 3: `http://localhost:8083`

### **Solution 2: Release Port 80 on Windows**
If you want to use Nginx, you must stop the service using Port 80. Open PowerShell **as Administrator** and run:
```powershell
Stop-Service -Name W3SVC -ErrorAction SilentlyContinue
net stop http
```
*(Press `Y` if it asks to stop related services like World Web Publishing Service)*. Then, try launching Nginx again.

---

## 3. Running the Server

1. Ensure the virtual environment is activated.
2. Run the worker startup script:
   ```powershell
   .\start_workers.bat
   ```
   This launches 3 workers on ports `8081`, `8082`, and `8083` in separate window prompts.

---

## 4. Testing `/deepchat`

Here are the exact scripts and commands to test the deep research pipeline.

### **Test A: Python Script (Recommended — Handles quote escaping)**
Run this command in your terminal (with the virtual environment activated) to test a multi-part comparison query:

```powershell
python -c "import requests; r = requests.post('http://localhost:8081/deepchat', json={'question': 'Compare print journalism and radio journalism'}); print(r.json())"
```

### **Test B: Curl (Standard JSON Output)**
If you prefer `curl.exe`:

```powershell
curl.exe -X POST -H "Content-Type: application/json" -d "{\"question\": \"What is photojournalism?\", \"use_history\": false}" http://localhost:8081/deepchat
```

### **Test C: Testing Web Fallback (Tavily)**
To test the web search fallback, ask a question not present in the course syllabus (e.g. quantum computing):

```powershell
python -c "import requests; r = requests.post('http://localhost:8081/deepchat', json={'question': 'What is quantum computing vs media ethics?'}); print(r.json())"
```
In the response, look at the `layer_trace` array:
- `What is quantum computing...` will have `"resolved_by": "web"` and include `web_sources`.
- `What is media ethics...` will have `"resolved_by": "corpus"`.
