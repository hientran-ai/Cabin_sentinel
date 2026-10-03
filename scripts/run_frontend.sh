#!/usr/bin/env bash
# Local dashboard (owner live camera, fleet/admin, guardian) on http://127.0.0.1:5183
#   ./scripts/run_frontend.sh            # production build + vite preview (recommended for demos)
#   ./scripts/run_frontend.sh dev        # vite dev server with HMR on the same port
# API URLs come from VITE_API_BASE_URL / VITE_CAMERA_API_BASE_URL (default: local backend 7863).
set -euo pipefail
cd "$(dirname "$0")/../frontend"
export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://127.0.0.1:7863}"
export VITE_CAMERA_API_BASE_URL="${VITE_CAMERA_API_BASE_URL:-$VITE_API_BASE_URL}"
PORT="${FRONTEND_PORT:-5183}"
[ -d node_modules ] || npm ci
echo "Frontend → http://127.0.0.1:$PORT  (API $VITE_API_BASE_URL, camera $VITE_CAMERA_API_BASE_URL)"
if [ "${1:-preview}" = "dev" ]; then
  exec npx vite --host 127.0.0.1 --port "$PORT" --strictPort
fi
npm run build
exec npx vite preview --host 127.0.0.1 --port "$PORT" --strictPort
