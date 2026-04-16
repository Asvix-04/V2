#!/bin/bash

# DigiLab - Start All Servers
# This script starts the Python AI Server, the Node.js Bridge, and the Frontend.

echo "🚀 Starting DigiLab Servers..."

# 1. Start Python AI Server (Port 8000)
echo "🐍 Starting Python AI Server on port 8000..."
cd Backend_chatbot
/usr/local/bin/python3 api_server.py > python_server.log 2>&1 &
PYTHON_PID=$!
cd ..

# 2. Start Node.js Bridge (Port 5001)
echo "📦 Starting Node.js Bridge (Backend) on port 5001..."
cd crypt/backend
npm start > node_server.log 2>&1 &
NODE_PID=$!
cd ../..

# 3. Start Frontend (Port 5173/5174)
echo "💻 Starting Frontend..."
cd crypt
npm run dev
cd ..

# Cleanup function to kill background processes on exit
trap "kill $PYTHON_PID $NODE_PID; exit" INT TERM EXIT
