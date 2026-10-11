#!/bin/bash
# One command for the first week: production server on this Mac + a free public https address (Cloudflare quick tunnel).
# Keeps the Mac awake while running. Ctrl-C stops everything. The tunnel address changes every run: re-enter it in the app.
set -e
cd "$(dirname "$0")/.."
PORT="${PORT:-8100}"   # not 8000: that port is the demo server used by the old app
LOG=backend/data; mkdir -p "$LOG"
cleanup() { kill $SRV $TUN $AWAKE 2>/dev/null || true; }
trap cleanup EXIT INT TERM

[ -f backend/.env ] || { echo "Missing backend/.env (see backend/.env.example)"; exit 1; }
set -a; . backend/.env; set +a
echo "Starting production server on :$PORT ..."
PORT=$PORT backend/run_prod.sh > "$LOG/server.log" 2>&1 & SRV=$!
for i in $(seq 1 30); do curl -sf "localhost:$PORT/health" | grep -q '"env":"production"' && break; sleep 1; done
# Must be OUR production server, not some other program already listening on the port.
curl -sf "localhost:$PORT/health" | grep -q '"env":"production"' || { echo "Production server did not start on :$PORT. See $LOG/server.log"; tail -5 "$LOG/server.log"; exit 1; }

caffeinate -dimsu & AWAKE=$!
cloudflared tunnel --url "http://localhost:$PORT" --no-autoupdate > "$LOG/tunnel.log" 2>&1 & TUN=$!
URL=""
for i in $(seq 1 40); do URL=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$LOG/tunnel.log" | head -1); [ -n "$URL" ] && break; sleep 1; done
[ -n "$URL" ] || { echo "No tunnel address. See $LOG/tunnel.log"; exit 1; }

echo
echo "=============================================================="
echo " Server address (enter this in the app):  $URL"
echo " Sign-in codes arrive in ntfy, topic:     $OTP_NTFY_TOPIC"
echo " Keep this window open. Mac stays awake. Ctrl-C to stop."
echo "=============================================================="
echo "$URL" > "$LOG/address.txt"
wait $SRV
