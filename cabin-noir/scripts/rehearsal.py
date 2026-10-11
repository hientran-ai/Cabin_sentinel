#!/usr/bin/env python3
"""Local production rehearsal: a production-mode server on :8001 plus a mock ntfy that prints every push.
Sign-in codes appear here (they are pushed to the private admin topic). Ctrl-C to stop.

  python3 scripts/rehearsal.py            # start
  python3 scripts/fake_device.py CODE     # stand in for the in-car device (no camera needed)
"""
import json, os, subprocess, sys, tempfile, threading, time
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = "/tmp/cabin-rehearsal"
os.makedirs(LOG, exist_ok=True)


class Ntfy(BaseHTTPRequestHandler):
    def do_POST(self):
        d = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        line = f"[{time.strftime('%H:%M:%S')}] {d['topic'][:10]:10} P{d.get('priority', 3)} {d['title']} | {d['message']}"
        print(line, flush=True)
        open(f"{LOG}/ntfy.log", "a").write(line + "\n")
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")

    def log_message(self, *a): pass


def main():
    ntfy = HTTPServer(("127.0.0.1", 8790), Ntfy)
    threading.Thread(target=ntfy.serve_forever, daemon=True).start()
    env = {**os.environ, "CABIN_ENV": "production", "CABIN_DB": f"{LOG}/db.sqlite", "CABIN_MEDIA": f"{LOG}/media",
           "NTFY_URL": "http://127.0.0.1:8790", "OTP_NTFY_TOPIC": "admin-otp"}
    srv = subprocess.Popen([os.path.join(ROOT, "backend/.venv/bin/python"), "-m", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"],
                           cwd=os.path.join(ROOT, "backend"), env=env, stdout=open(f"{LOG}/server.log", "w"), stderr=subprocess.STDOUT)
    print("Rehearsal server: http://127.0.0.1:8001 (production mode). Pushes print below.", flush=True)
    try:
        srv.wait()
    except KeyboardInterrupt:
        srv.terminate()


if __name__ == "__main__":
    sys.exit(main())
