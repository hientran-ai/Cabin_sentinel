"""Execute the Docker probe against a real HTTP server with known health states."""

import json
import os
import subprocess
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]


@pytest.mark.parametrize(("status", "body", "expected_exit"), [
    (200, {"status": "ok", "backend": "ready", "database": "ready", "vision": "ready"}, 0),
    (503, {"status": "degraded", "backend": "ready", "database": "ready", "vision": "unavailable"}, 0),
    (503, {"status": "degraded", "backend": "unavailable", "database": "unavailable", "vision": "ready"}, 1),
    (500, {"backend": "ready", "database": "ready"}, 1),
    (200, {}, 1),
    (200, b"not-json", 1),
])
def test_docker_probe_distinguishes_live_backend_from_failed_store(status, body, expected_exit):
    response = body if isinstance(body, bytes) else json.dumps(body).encode()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            assert self.path == "/health"
            self.send_response(status)
            self.end_headers()
            self.wfile.write(response)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        result = subprocess.run(
            _docker_probe(), cwd=ROOT,
            env={**os.environ, "PORT": str(server.server_port)},
            capture_output=True, text=True, timeout=10,
        )
        assert result.returncode == expected_exit, result.stdout + result.stderr
    finally:
        server.shutdown()
        worker.join(timeout=2)
        server.server_close()


def _docker_probe():
    dockerfile = (ROOT / "Dockerfile").read_text().replace("\\\n", "")
    instruction = next(line for line in dockerfile.splitlines() if line.startswith("HEALTHCHECK "))
    command = instruction.split(" CMD ", 1)[1].strip()
    if command.startswith("["):
        args = json.loads(command)
        args[0] = sys.executable
        return args
    # Run the original shell form too, so the regression can catch syntax errors.
    return ["sh", "-c", command.replace("python ", f"'{sys.executable}' ", 1)]
