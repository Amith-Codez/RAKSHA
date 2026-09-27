#!/usr/bin/env bash
# RAKSHA · one command:  bash start.sh
# Starts the RAKSHA server on http://localhost:8000 (extension API + website + practice feed at /demo).
# First run creates backend/.venv and installs the Python packages (needs Python 3.10+).
set -e
cd "$(dirname "$0")/backend"
if [ ! -f .env ] && [ ! -f ../.env ]; then
  echo "  No .env yet: copy backend/.env.example to backend/.env and add GEMINI_API_KEY=..."
fi
if ! ./.venv/bin/python -c "import sys" >/dev/null 2>&1; then
  rm -rf .venv
  python3 -m venv .venv
fi
./.venv/bin/python -m pip install -q -r requirements.txt
( sleep 2; (command -v open >/dev/null && open http://localhost:8000/demo) || true ) &
./.venv/bin/python server.py
