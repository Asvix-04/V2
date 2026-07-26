#!/usr/bin/env bash

# Production entrypoint for the single-container DigiLab deployment.
# Express serves the built React app publicly while FastAPI remains internal.

set -Eeuo pipefail

APP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PYTHON_PORT="${PYTHON_PORT:-8000}"
PORT="${PORT:-7860}"

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  kill "${PYTHON_PID:-}" "${NODE_PID:-}" 2>/dev/null || true
  wait "${PYTHON_PID:-}" "${NODE_PID:-}" 2>/dev/null || true
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

echo "Starting Python AI service on 127.0.0.1:${PYTHON_PORT}"
cd "$APP_ROOT/Backend_chatbot"
python -m uvicorn api_server:app \
  --host 127.0.0.1 \
  --port "$PYTHON_PORT" \
  --log-level info &
PYTHON_PID=$!

echo "Starting DigiLab web service on 0.0.0.0:${PORT}"
cd "$APP_ROOT"
node crypt/backend/src/app.js &
NODE_PID=$!

# Exit the container if either service stops so the platform can restart it.
wait -n "$PYTHON_PID" "$NODE_PID"
