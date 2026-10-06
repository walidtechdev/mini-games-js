#!/usr/bin/env bash
# Launch PixelForge Studio on Ubuntu. ComfyUI stays a separate process.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 was not found. Install Python 3.11 or newer." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node was not found. Install Node.js 20 or newer." >&2
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "Creating .env from .env.example"
  cp .env.example .env
fi

if [[ ! -x backend/.venv/bin/python ]]; then
  echo "Creating the Python virtual environment..."
  python3 -m venv backend/.venv
fi

echo "Installing Python packages..."
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt

if [[ ! -d frontend/node_modules ]]; then
  echo "Installing frontend packages..."
  (cd frontend && npm install)
fi

API_PID=""
UI_PID=""

cleanup() {
  trap - EXIT INT TERM
  if [[ -n "$API_PID" ]]; then
    kill "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "$UI_PID" ]]; then
    kill "$UI_PID" 2>/dev/null || true
  fi
  if [[ -n "$API_PID" ]]; then
    wait "$API_PID" 2>/dev/null || true
  fi
  if [[ -n "$UI_PID" ]]; then
    wait "$UI_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

echo "Starting the API at http://127.0.0.1:8787"
(
  cd "$ROOT/backend"
  exec "$ROOT/backend/.venv/bin/python" -m uvicorn app.main:app --host 127.0.0.1 --port 8787
) &
API_PID=$!

echo "Starting the UI at http://127.0.0.1:5173"
(
  cd "$ROOT/frontend"
  exec npm run dev -- --host 127.0.0.1 --port 5173
) &
UI_PID=$!

echo
echo "Open http://127.0.0.1:5173"
echo "Start ComfyUI separately, then use Settings -> Test ComfyUI Connection."
echo "Press Ctrl+C to stop PixelForge."
echo

wait -n "$API_PID" "$UI_PID"
exit $?
