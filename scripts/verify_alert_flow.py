"""Exercise a running demo API with its real configured YOLO provider.

All vehicle telemetry and actions remain SIMULATED. No credentials are printed.
"""

import argparse
import json
import time
from io import BytesIO
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from uuid import uuid4

from PIL import Image


def check(condition, message):
    if not condition:
        raise RuntimeError(message)


def http(base, path, *, method="GET", body=None, headers=None, expected=200):
    request = Request(base.rstrip("/") + path, data=body, headers=headers or {}, method=method)
    try:
        with urlopen(request, timeout=60) as response:
            status, data = response.status, response.read()
    except HTTPError as exc:
        status, data = exc.code, exc.read()
    result = json.loads(data)
    check(status == expected, f"{method} {path}: expected {expected}, received {status}: {result}")
    return result


def upload(base, image, content_type, scenario, session=None):
    boundary = "CabinFlow" + uuid4().hex
    fields = {"scenario": scenario}
    headers = {"Content-Type": f"multipart/form-data; boundary={boundary}"}
    if session:
        fields["session_id"] = session["id"]
        headers["Authorization"] = "Bearer " + session["token"]
    parts = [
        f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode()
        for key, value in fields.items()
    ]
    suffix = "png" if content_type == "image/png" else "jpg"
    parts.extend(
        [
            f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="cabin.{suffix}"\r\nContent-Type: {content_type}\r\n\r\n'.encode(),
            image,
            f"\r\n--{boundary}--\r\n".encode(),
        ]
    )
    return http(base, "/api/v1/demo/analyze", method="POST", body=b"".join(parts), headers=headers)


def verify(base, image_path, *, watch_schedule=False):
    health = http(base, "/health")
    check(health["vision"] == "ready" and health["safety_timer"] == "ready", "Model/timer not ready")
    print("PASS 1: FastAPI, model, SQLite and independent timer ready")
    content_type = "image/png" if image_path.suffix.lower() == ".png" else "image/jpeg"
    image = image_path.read_bytes()
    first = upload(base, image, content_type, "parked_locked")
    session = {"id": first["session_id"], "token": first["session_token"]}
    path = f"/api/v1/demo/sessions/{session['id']}"
    auth = {"Authorization": "Bearer " + session["token"]}
    state = http(base, path, headers=auth)
    check(
        state["risk_level"] == "WARNING" and state["incident"]["status"] == "OPEN",
        "This image did not produce an unattended occupant WARNING; choose a clear person/dog/cat image and inspect detections",
    )
    incident = state["incident_id"]
    print("PASS 2: image -> current YOLO -> VisionPayload -> WARNING + open incident")
    http(base, path, expected=401)
    http(base, path, headers={"Authorization": "Bearer incorrect"}, expected=403)
    json_headers = {**auth, "Content-Type": "application/json"}
    acknowledged = http(
        base,
        path + "/acknowledge",
        method="POST",
        body=json.dumps({"incident_id": incident}).encode(),
        headers=json_headers,
    )
    check(acknowledged["incident"]["status"] == "OPEN", "ACK incorrectly resolved the incident")
    print("PASS 3: token checks and ACK does not resolve/unlock")
    hot = upload(base, image, content_type, "hot_locked", session)
    check(hot["reasoning"]["risk_level"] == "CRITICAL", "Hot confirmed occupant must be CRITICAL immediately")
    check(
        all(result["status"] in {"simulated", "pending_human_confirmation"} for result in hot["actions"]),
        "Demo action claimed real execution",
    )
    state = http(base, path, headers=auth)
    check(state["incident_id"] == incident, "Risk transition changed the incident")
    print("PASS 4: CRITICAL immediately; same incident; actions simulated/pending")
    time.sleep(6)
    stale = http(base, path, headers=auth)
    check(
        stale["risk_level"] == "ERROR" and not stale["decision_current"], "HTTP-only timer did not detect stale sources"
    )
    check(
        stale["incident_id"] == incident and stale["incident"]["status"] == "OPEN", "Stale sources cleared the incident"
    )
    print("PASS 5: no MQTT/packets -> stale ERROR; incident retained")
    if watch_schedule:
        limit = time.monotonic() + 100
        while time.monotonic() < limit:
            watched = http(base, path, headers=auth)
            check(watched["incident"]["status"] == "OPEN", "Timer auto-resolved the incident")
            if watched["alert"]["stage"] == "ESCALATED":
                check(watched["alert"]["repeat_count"] >= 1, "Missing minute repeat")
                check(watched["alert"]["escalation_target_met"], "Runtime escalation exceeded 90s")
                check(watched["alert"]["repeat_target_met"], "Runtime minute repeat was late")
                print("PASS 5b: runtime repeat within 60s; escalation within 90s after initial cue (SIMULATED)")
                break
            time.sleep(1)
        else:
            raise RuntimeError("Runtime timer did not escalate before the observation timeout")

    cool = upload(base, image, content_type, "parked_locked", session)
    check(cool["reasoning"]["risk_level"] == "WARNING", "Cooling should return evidence risk WARNING")
    state = http(base, path, headers=auth)
    check(state["incident_id"] == incident, "Cooling cleared/replaced the incident")
    blank = BytesIO()
    Image.new("RGB", (640, 480), "white").save(blank, format="JPEG")
    empty = upload(base, blank.getvalue(), "image/jpeg", "parked_locked", session)
    check(not empty["vision"]["detections"], "Synthetic blank test input unexpectedly detected an object")
    state = http(base, path, headers=auth)
    check(
        state["risk_level"] == "WARNING" and state["rule_id"] == "UNRESOLVED_OCCUPANT",
        "An empty frame auto-cleared the incident",
    )
    print("PASS 6: cooling/empty test image do not auto-resolve")
    body = json.dumps({"incident_id": incident, "revision": state["revision"], "cabin_checked": True}).encode()
    resolved = http(base, path + "/resolve", method="POST", body=body, headers=json_headers)
    check(
        resolved["incident"]["status"] == "RESOLVED" and resolved["risk_level"] == "SAFE",
        "Separate demo cabin check failed",
    )
    events = http(base, path + "/events?limit=100", headers=auth)
    check(any(event["event_type"] == "incident_resolution" for event in events), "Missing resolution audit")
    print("PASS 7: explicit cabin check against current revision; audited resolution")
    print(
        "FLOW VERIFIED on this local runtime. Vehicle telemetry/actions are SIMULATED; a blank test image is not evidence about a real cabin."
    )
    return {
        "result": "PASS",
        "checks": 7,
        "model": health["vision"],
        "timer": health["safety_timer"],
        "actions": "SIMULATED",
        "vehicle_telemetry": "SIMULATED",
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-url", default="http://127.0.0.1:8002")
    parser.add_argument("--image", required=True, type=Path)
    parser.add_argument(
        "--watch-schedule", action="store_true", help="Observe real timer repeat/escalation; adds about 90 seconds"
    )
    args = parser.parse_args()
    verify(args.base_url, args.image, watch_schedule=args.watch_schedule)
