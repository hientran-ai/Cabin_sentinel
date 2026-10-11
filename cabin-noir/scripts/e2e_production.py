#!/usr/bin/env python3
"""Black-box end-to-end check of the production backend: real uvicorn process, real alert worker, a mock ntfy server.

owner signs in -> adds a vehicle -> pairs a device -> device reports a person in a hot parked car -> the family is
pushed WITHOUT anyone opening the app -> repeated while unseen -> viewed -> confirm is refused while the person is
still there -> device reports an empty cabin -> confirm closes it -> family told. Takes about 80 seconds.
"""
import json, os, subprocess, sys, tempfile, threading, time, urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUSHES: list[dict] = []


class Ntfy(BaseHTTPRequestHandler):
    def do_POST(self):
        PUSHES.append(json.loads(self.rfile.read(int(self.headers["Content-Length"]))))
        self.send_response(200); self.end_headers(); self.wfile.write(b"{}")

    def log_message(self, *a): pass


def call(base, method, path, body=None, token=None):
    req = urllib.request.Request(base + path, method=method, data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read() or b"{}")


def wait(cond, timeout, what):
    end = time.time() + timeout
    while time.time() < end:
        try:
            if cond():
                return
        except OSError:
            pass   # server still starting
        time.sleep(0.5)
    raise SystemExit(f"FAIL: {what}")


def ok(msg): print("  ok -", msg, flush=True)


def main():
    ntfy = HTTPServer(("127.0.0.1", 0), Ntfy)
    threading.Thread(target=ntfy.serve_forever, daemon=True).start()
    port = 8765
    tmp = tempfile.mkdtemp()
    env = {**os.environ, "CABIN_ENV": "production", "CABIN_DB": f"{tmp}/db.sqlite", "CABIN_MEDIA": f"{tmp}/media",
           "NTFY_URL": f"http://127.0.0.1:{ntfy.server_port}", "OTP_NTFY_TOPIC": "admin-otp"}
    py = os.path.join(ROOT, "backend/.venv/bin/python")
    srv = subprocess.Popen([py, "-m", "uvicorn", "app.main:app", "--port", str(port), "--workers", "1"], cwd=os.path.join(ROOT, "backend"),
                           env=env, stdout=open(os.path.join(tmp, "server.log"), "w"), stderr=subprocess.STDOUT)
    base = f"http://127.0.0.1:{port}"
    try:
        wait(lambda: call(base, "GET", "/health")[0] == 200, 20, "server did not start")
        cfg = call(base, "GET", "/v1/config")[1]
        assert cfg["production"] and not cfg["simulation"]; ok("server is in production mode, simulation off")
        assert call(base, "POST", "/v1/sim/vehicles/x/scenario", {"name": "safe"})[0] in (401, 404); ok("simulator endpoint unavailable")

        call(base, "POST", "/v1/auth/otp", {"phone": "0903123789"})
        code = PUSHES[-1]["message"].split(": ")[1].split(" ")[0]
        assert PUSHES[-1]["topic"] == "admin-otp"; ok("sign-in code delivered over the private channel only")
        tok = call(base, "POST", "/v1/auth/verify", {"phone": "0903123789", "code": code, "name": "Minh"})[1]["token"]
        veh = call(base, "POST", "/v1/vehicles", {"name": "Xe nhà", "model": "VinFast VF 8", "plate": "30A-123.45", "color": "white"}, tok)[1]
        vid = veh["vehicle"]["id"]
        assert veh["verdict"]["level"] == "unknown"; ok("new vehicle without a device is 'unknown', never 'safe'")
        pair = call(base, "POST", f"/v1/vehicles/{vid}/devices/pairing", token=tok)[1]["code"]
        dev = call(base, "POST", "/v1/device/pair", {"code": pair, "label": "iPhone cũ", "platform": "ios"})[1]["device_token"]
        ok("device paired with a one-time code")

        def frame(people):
            return call(base, "POST", "/v1/device/telemetry", {
                "detections": [{"seat": "rear_right", "kind": "person", "conf": 0.9}] if people else [], "camera_ok": True,
                "model": "e2e", "battery_pct": 70, "thermal": "nominal", "outside_temp": 33.0, "engine_on": False}, dev)

        assert frame(False)[0] == 200
        assert call(base, "GET", f"/v1/vehicles/{vid}/status", token=tok)[1]["verdict"]["level"] == "safe"; ok("empty cabin with a live device -> safe")
        PUSHES.clear()
        frame(True)
        t0 = time.time()
        wait(lambda: any("người trong xe" in p["title"] for p in PUSHES), 15, "no push for the incident")
        first = [p for p in PUSHES if "người trong xe" in p["title"]][0]
        assert first["priority"] == 5 and first["topic"].startswith("cs-")
        ok(f"critical push reached the family in {time.time() - t0:.1f}s with nobody polling")
        for _ in range(66):   # keep the device alive until the repeat is due
            frame(True); time.sleep(1)
            if any("Vẫn chưa ai xem" in p["title"] for p in PUSHES):
                break
        assert any("Vẫn chưa ai xem" in p["title"] for p in PUSHES); ok("push repeats while nobody has looked")
        inc = call(base, "GET", f"/v1/vehicles/{vid}/status", token=tok)[1]["incident"]
        steps = {s["key"]: s["state"] for s in call(base, "GET", f"/v1/incidents/{inc['id']}", token=tok)[1]["escalation"]["steps"]}
        assert steps["push"] == "done" and steps["sms_owner"] == "skipped" and steps["call_owner"] == "skipped"
        ok(f"escalation tells the truth: sms_owner={steps['sms_owner']}, call_owner={steps['call_owner']} (not configured / unsupported)")
        call(base, "POST", f"/v1/incidents/{inc['id']}/view", token=tok)
        rev = call(base, "GET", f"/v1/incidents/{inc['id']}", token=tok)[1]["revision"]
        r = call(base, "POST", f"/v1/incidents/{inc['id']}/confirm", {"revision": rev, "checks": ["seats", "floor", "trunk"]}, tok)[1]
        assert r["result"] == "rejected" and r["reject"]["code"] == "presence"; ok("confirm refused while the camera still sees a person")
        frame(False)
        rev = call(base, "GET", f"/v1/incidents/{inc['id']}", token=tok)[1]["revision"]
        r = call(base, "POST", f"/v1/incidents/{inc['id']}/confirm", {"revision": rev, "checks": ["seats", "floor", "trunk"]}, tok)[1]
        assert r["result"] == "resolved"; ok("confirmed check closes the incident")
        wait(lambda: any(p["title"] == "Đã đóng sự cố" for p in PUSHES), 15, "family not told about closing")
        ok("family told the incident was closed")
        print("PASS")
    finally:
        srv.terminate()
        print(open(os.path.join(tmp, "server.log")).read()[-1500:])


if __name__ == "__main__":
    sys.exit(main())
