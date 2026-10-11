#!/usr/bin/env python3
"""Stand-in for the in-car device: pairs with a code and sends one frame per second.
A person is reported in the rear-right seat while the file /tmp/cabin-rehearsal/person exists.
  touch /tmp/cabin-rehearsal/person   # someone sits in the back
  rm /tmp/cabin-rehearsal/person      # they leave
"""
import json, os, sys, time, urllib.request

server = os.environ.get("SERVER", "http://127.0.0.1:8001")


def post(path, body, token=None):
    req = urllib.request.Request(server + path, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json", **({"Authorization": f"Bearer {token}"} if token else {})})
    return json.loads(urllib.request.urlopen(req, timeout=8).read())


def get(path, token):
    req = urllib.request.Request(server + path, headers={"Authorization": f"Bearer {token}"})
    return json.loads(urllib.request.urlopen(req, timeout=8).read())


code = sys.argv[1]
if code.isdigit() and len(code) == 10:   # owner phone: sign in through the rehearsal's private OTP log and make a pairing code
    post("/v1/auth/otp", {"phone": code})
    time.sleep(0.5)
    otp = [l for l in open("/tmp/cabin-rehearsal/ntfy.log") if code in l][-1].split(": ")[1].split(" ")[0]
    owner = post("/v1/auth/verify", {"phone": code, "code": otp, "name": "Owner"})["token"]
    vid = get("/v1/vehicles", owner)[0]["vehicle"]["id"]
    code = post(f"/v1/vehicles/{vid}/devices/pairing", {}, owner)["code"]
    print("pairing code", code, flush=True)
token = post("/v1/device/pair", {"code": code, "label": "Thiết bị giả lập", "platform": "ios"})["device_token"]
print("paired; sending frames (Ctrl-C to stop)", flush=True)
while True:
    person = os.path.exists("/tmp/cabin-rehearsal/person")
    try:
        post("/v1/device/telemetry", {"detections": [{"seat": "rear_right", "kind": "person", "conf": 0.88}] if person else [], "camera_ok": True,
                                      "model": "fake", "battery_pct": 76, "thermal": "nominal", "outside_temp": 32.0}, token)
    except OSError as e:   # like a real device: keep trying when the network or server blips
        print("send failed:", e, flush=True)
    time.sleep(1)
