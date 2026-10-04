#!/usr/bin/env bash
# Local backend: Gradio camera API + FastAPI REST (fleet, guardian, demo) on one port.
#   ./scripts/run_backend.sh            # http://127.0.0.1:7863
# Override any variable below by exporting it first (see .env.example).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [ ! -x .venv/bin/python ]; then
  echo "Creating .venv (Python 3.12) and installing requirements…"
  python3.12 -m venv .venv
  .venv/bin/pip install -q -r requirements.txt "gradio==6.29.0" opencv-python-headless
fi

YUNET="models/face_detection_yunet_2023mar.onnx"
YUNET_SHA="8f2383e4dd3cfbb4553ea8718107fc0423210dc964f9f4280604804ed2552fa4"
if [ ! -f "${FACE_MODEL_PATH:-$YUNET}" ]; then
  echo "WARNING: YuNet face model missing; camera previews will be withheld (never shown raw)." >&2
  echo "  curl -fL https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/face_detection_yunet/face_detection_yunet_2023mar.onnx -o $YUNET" >&2
  echo "  expected sha256 $YUNET_SHA" >&2
fi

mkdir -p data
# Device token for scripts/simulate_vehicle.py: generated once, kept out of git (/data/ is ignored).
if [ -z "${CABINSENTINEL_DEVICE_TOKEN:-}" ]; then
  if [ ! -s data/.device-token ]; then
    (umask 077; .venv/bin/python -c "import secrets; print(secrets.token_urlsafe(32))" > data/.device-token)
  fi
  CABINSENTINEL_DEVICE_TOKEN="$(cat data/.device-token)"
fi

export CABINSENTINEL_DEVICE_TOKEN
export PORT="${PORT:-7863}"
export APP_ENV="${APP_ENV:-development}"
export CORS_ORIGINS="${CORS_ORIGINS:-http://127.0.0.1:5183,http://localhost:5183,http://127.0.0.1:5173,http://localhost:5173}"
export CABINSENTINEL_DB_PATH="${CABINSENTINEL_DB_PATH:-data/cabinsentinel-local.db}"
export CABINSENTINEL_MQTT_ENABLED="${CABINSENTINEL_MQTT_ENABLED:-false}"
export GRADIO_ANALYTICS_ENABLED=false

echo "CabinSentinel backend on http://127.0.0.1:$PORT  (health: /health, docs: /docs)"
echo "CORS: $CORS_ORIGINS"
exec .venv/bin/python app.py
