#!/bin/sh
# Production start: loads backend/.env, refuses to run without a sign-in code channel, one worker (SQLite + alert worker).
set -e
cd "$(dirname "$0")"
[ -f .env ] && set -a && . ./.env && set +a
export CABIN_ENV=production
if [ ! -d .venv ]; then
  python3 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt
fi
exec .venv/bin/uvicorn app.main:app --host "${HOST:-0.0.0.0}" --port "${PORT:-8000}" --workers 1 --proxy-headers
