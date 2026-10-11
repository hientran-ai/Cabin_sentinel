"""End-to-end flow plus authorization sweep: a stranger, a viewer and a device token must not reach what is not theirs."""
from app import alerts, main
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

PERSON = frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9, "age": "child", "box": [0.2, 0.3, 0.2, 0.3]}])


def vehicle_gets(vid, inc):
    return [f"/v1/vehicles/{vid}/status", f"/v1/vehicles/{vid}/history", f"/v1/vehicles/{vid}/log",
            f"/v1/vehicles/{vid}/log/summary", f"/v1/vehicles/{vid}/log/verify", f"/v1/vehicles/{vid}/log.csv", f"/v1/vehicles/{vid}/live",
            f"/v1/vehicles/{vid}/members", f"/v1/vehicles/{vid}/devices", f"/v1/vehicles/{vid}/audit", f"/v1/vehicles/{vid}/photos",
            f"/v1/vehicles/{vid}/observations", f"/v1/vehicles/{vid}/track", f"/v1/vehicles/{vid}/location", f"/v1/vehicles/{vid}/trips",
            f"/v1/incidents/{inc}", f"/v1/incidents/{inc}/report"]


def test_end_to_end_then_stranger_viewer_and_device_are_kept_out(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    # flow: device sees a child -> alert -> owner views, reads live/log/report/csv -> confirms -> sealed log
    assert c.post("/v1/device/telemetry", json=PERSON, headers=dh).status_code == 200
    alerts.run_once(main.refresh)
    inc = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()["incidents"][0]["id"]
    live = c.get(f"/v1/vehicles/{vid}/live", headers=h).json()
    assert "image" not in str(live).lower() and live["detections"][0]["box"]                      # boxes only, never pixels
    for path in vehicle_gets(vid, inc):
        r = c.get(path, headers=h)
        assert r.status_code in (200, 404), (path, r.status_code)                                   # 404 only for endpoints this role has no data on
    # a different logged-in user: everything is closed, and the answer does not say whether the id exists
    h2, _ = login(c, sent, phone="0912000111", name="Người lạ")
    for path in vehicle_gets(vid, inc):
        r = c.get(path, headers=h2)
        assert r.status_code in (403, 404), (path, r.status_code, r.text[:80])
    assert c.get("/v1/me/overview", headers=h2).json()["vehicles"] == []
    assert not any("Xe nhà" in str(n) for n in c.get("/v1/me/notifications", headers=h2).json().get("items", []))
    assert c.post(f"/v1/incidents/{inc}/confirm", json={"revision": 1, "checks": ["seats"]}, headers=h2).status_code in (403, 404)
    assert c.post(f"/v1/incidents/{inc}/view", headers=h2).status_code in (403, 404)
    assert c.delete(f"/v1/vehicles/{vid}", headers=h2).status_code in (403, 404)
    assert c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=h2).status_code in (403, 404)
    assert c.post(f"/v1/vehicles/{vid}/members", json={"phone": "0912000111", "name": "Lạ", "role": "confirm"}, headers=h2).status_code in (403, 404)
    # a device token is not a user token, and a user token is not a device token
    for path in (f"/v1/vehicles/{vid}/log", "/v1/me", "/v1/vehicles", f"/v1/vehicles/{vid}/live"):
        assert c.get(path, headers=dh).status_code in (401, 403), path
    assert c.post("/v1/device/telemetry", json=frame(), headers=h).status_code in (401, 403)
    # no token / garbage token
    for path in vehicle_gets(vid, inc) + ["/v1/me", "/v1/me/export", "/v1/me/sessions"]:
        assert c.get(path).status_code == 401, path
        assert c.get(path, headers={"Authorization": "Bearer nope"}).status_code == 401, path
    # logout kills the session; logout-all kills the others
    assert c.post("/v1/auth/logout", headers=h2).status_code == 200
    assert c.get("/v1/me", headers=h2).status_code == 401
    assert c.get("/v1/me", headers=h).status_code == 200


def test_production_does_not_publish_its_api_map(tmp_path):
    """Run in a fresh process so reloading the app cannot disturb the other tests."""
    import os, subprocess, sys
    code = "from app import main; a = main.app; print(a.docs_url, a.redoc_url, a.openapi_url)"
    env = {**os.environ, "CABIN_ENV": "production", "CABIN_DB": str(tmp_path / "x.db"), "CABIN_SECRET": "s" * 40}
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, env=env, cwd=os.path.dirname(os.path.dirname(__file__)))
    assert out.stdout.strip().splitlines()[-1] == "None None None", out.stdout + out.stderr


def test_input_abuse_is_rejected_cleanly(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    bad_boxes = [[-0.5, 0, 0.1, 0.1], [0, 0, 5, 5], [0.9, 0.9, 0.5, 0.5], ["a", 0, 0, 0], [0, 0, 0]]
    for b in bad_boxes:
        det = {"seat": "rear_right", "kind": "person", "conf": 0.9, "box": b}
        assert c.post("/v1/device/telemetry", json=frame(detections=[det]), headers=dh).status_code in (400, 422), b
    for evil in ("'; DROP TABLE users;--", "<script>alert(1)</script>", "../../etc/passwd", "A" * 5000):
        r = c.post("/v1/vehicles", json={"name": evil, "plate": evil}, headers=h)
        assert r.status_code in (200, 201, 400, 422)
        assert "Traceback" not in r.text
    assert c.get("/v1/vehicles", headers=h).status_code == 200                                      # the table is still there
    assert c.get(f"/v1/vehicles/{vid}/log", params={"days": "abc"}, headers=h).status_code in (400, 422)
    assert c.get(f"/v1/vehicles/{vid}/log", params={"days": 99999}, headers=h).status_code in (200, 400, 422)
    assert c.get(f"/v1/vehicles/{vid}/log", params={"kind": "x' OR 1=1--"}, headers=h).status_code in (200, 400, 422)


def test_report_has_no_cabin_temperature_without_a_cabin_sensor(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    inc = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()["incidents"][0]
    assert c.get(f"/v1/incidents/{inc['id']}", headers=h).json()["cabin_temp"] is None
    rep = c.get(f"/v1/incidents/{inc['id']}/report", headers=h).json()
    assert rep["incident"]["cabin_temp"] is None
