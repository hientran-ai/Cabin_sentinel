import os
import tempfile

import pytest
from fastapi.testclient import TestClient

from app import db, logic
from app import main as main_mod
from app.main import OTP_SENT, RATE, app, seed


class Clock:
    def __init__(self) -> None:
        self.t = 1_790_000_000.0

    def __call__(self) -> float:
        return self.t


@pytest.fixture()
def env():
    path = os.path.join(tempfile.mkdtemp(), "t.db")
    db.reset(path)
    clock = Clock()
    logic.set_clock(clock)
    seed()
    OTP_SENT.clear()
    RATE.clear()
    main_mod.AUDIT_SYNC = True
    with TestClient(app) as c:
        yield c, clock


def login(c, phone="0903123789", name="Minh"):
    code = c.post("/v1/auth/otp", json={"phone": phone}).json()["dev_code"]
    r = c.post("/v1/auth/verify", json={"phone": phone, "code": code, "name": name})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['token']}"}


def link(c, h, code="CS-VF8-2026"):
    r = c.post("/v1/vehicles/link", json={"pair_code": code}, headers=h).json()
    s = c.post("/v1/vehicles/link/confirm", json={"challenge_id": r["challenge_id"], "code": r["dev_code"], "name": "SUV gia đình"}, headers=h)
    assert s.status_code == 200, s.text
    return s.json()["vehicle"]["id"]


def sim(c, h, vid, name):
    r = c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": name}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()


def test_auth_errors(env):
    c, _ = env
    assert c.post("/v1/auth/otp", json={"phone": "123"}).status_code == 422
    c.post("/v1/auth/otp", json={"phone": "0903123789"})
    r = c.post("/v1/auth/verify", json={"phone": "0903123789", "code": "000000x"})
    assert r.json()["detail"]["code"] == "otp_wrong"
    assert c.get("/v1/me").status_code == 401


def test_link_rules(env):
    c, _ = env
    h = login(c)
    assert c.post("/v1/vehicles/link", json={"pair_code": "nope"}, headers=h).status_code == 404
    vid = link(c, h)
    other = login(c, "0912000111", "Lan")
    r = c.post("/v1/vehicles/link", json={"pair_code": "CS-VF8-2026"}, headers=other)
    assert r.json()["detail"]["code"] == "already_owned"
    assert c.get(f"/v1/vehicles/{vid}/status", headers=other).status_code == 404


def test_incident_lifecycle(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "safe" and s["incident"] is None

    s = sim(c, h, vid, "warning")
    assert s["verdict"]["level"] == "warning"
    inc = s["incident"]
    assert inc["level"] == "warning" and inc["revision"] == 1

    s = sim(c, h, vid, "critical")
    assert s["incident"]["id"] == inc["id"] and s["incident"]["level"] == "critical" and s["incident"]["revision"] == 2

    clock.t += 95
    d = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()
    states = [x["state"] for x in d["escalation"]["steps"]]
    assert states[:4] == ["done"] * 4 and states[4] == "pending"

    d = c.post(f"/v1/incidents/{inc['id']}/view", headers=h).json()
    assert d["status"] == "open" and d["viewed_at"]
    clock.t += 200
    d = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()
    assert d["escalation"]["steps"][5]["state"] == "stopped"

    checks = ["seats", "floor", "trunk"]
    assert c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": 2, "checks": ["seats"]}, headers=h).status_code == 422
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": 2, "checks": checks}, headers=h).json()
    assert r["result"] == "rejected" and r["reject"]["code"] == "presence"

    sim(c, h, vid, "presence_clear")
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": 2, "checks": checks}, headers=h).json()
    assert r["reject"]["code"] == "changed"
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": r["revision"], "checks": checks}, headers=h).json()
    assert r["result"] == "resolved"
    hist = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()
    assert hist["incidents"][0]["status"] == "resolved"


def test_offline_never_safe(env):
    c, _ = env
    h = login(c)
    vid = link(c, h)
    s = sim(c, h, vid, "offline")
    assert s["verdict"]["level"] == "unknown" and s["verdict"]["current"] is False
    assert s["protection"]["level"] == "off"
    s = sim(c, h, vid, "camera_blocked")
    assert s["protection"]["level"] == "partial"


def test_climate(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    sim(c, h, vid, "critical")
    s = c.post(f"/v1/vehicles/{vid}/climate", json={"action": "start", "target": 20}, headers=h).json()
    assert s["climate"]["status"] == "sending"
    clock.t += 2
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["climate"]["status"] == "on"
    clock.t += 20
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["cabin_temp"] < 40
    sim(c, h, vid, "climate_fail_on")
    c.post(f"/v1/vehicles/{vid}/climate", json={"action": "start"}, headers=h)
    clock.t += 2
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["climate"]["status"] == "fail"


def test_family_roles(env):
    c, _ = env
    h = login(c)
    vid = link(c, h)
    assert c.post(f"/v1/vehicles/{vid}/members", json={"name": "Mẹ", "phone": "12", "role": "confirm"}, headers=h).status_code == 422
    m = c.post(f"/v1/vehicles/{vid}/members", json={"name": "Mẹ", "phone": "0912345456", "role": "view"}, headers=h).json()
    assert m[1]["status"] == "pending"
    mom = login(c, "0912345456", "Lan")
    assert c.get(f"/v1/vehicles/{vid}/status", headers=mom).status_code == 200
    sim(c, h, vid, "critical")
    inc = c.get(f"/v1/vehicles/{vid}/status", headers=mom).json()["incident"]
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": inc["revision"], "checks": ["seats", "floor", "trunk"]}, headers=mom)
    assert r.status_code == 403
    assert c.post(f"/v1/vehicles/{vid}/climate", json={"action": "start"}, headers=mom).status_code == 403
    c.patch(f"/v1/vehicles/{vid}/members/{m[1]['id']}", json={"role": "confirm"}, headers=h)
    assert c.post(f"/v1/vehicles/{vid}/climate", json={"action": "start"}, headers=mom).status_code == 200


def test_children_trips_exit(env):
    c, _ = env
    h = login(c)
    vid = link(c, h)
    kids = c.post("/v1/children", json={"name": "An", "cls": "Lớp 2A", "seat": "left"}, headers=h).json()
    assert len(kids) == 1
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()
    assert t[0]["stage"] == "waiting"
    sim(c, h, vid, "trip_arrived")
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]
    assert t["stage"] == "arrived" and t["log"][0]["title"] == "An xuống xe"
    s = sim(c, h, vid, "trip_leftin")
    assert s["verdict"]["level"] == "critical"
    s = sim(c, h, vid, "exit_child")
    assert s["exit_check"]["pending"] is True
    s = c.post(f"/v1/vehicles/{vid}/exit-check/confirm", headers=h).json()
    assert s["exit_check"]["pending"] is False


def test_phone_sensor(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    body = {"seat": "rear_right", "person_conf": 0.8, "locked": True, "cabin_temp": 38, "lat": 10.77, "lon": 106.7}
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json=body, headers=h).json()
    assert r["verdict"]["level"] == "critical" and r["source"] == "phone" and r["coords"]["lat"] == 10.77
    clock.t += 130  # the phone stops reporting: never shown as safe
    r = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert r["verdict"]["level"] == "unknown"
    c.post(f"/v1/vehicles/{vid}/telemetry", json={**body, "person_conf": 0.1}, headers=h)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] == "safe"
    assert c.post(f"/v1/vehicles/{vid}/telemetry", json={**body, "seat": "x"}, headers=h).status_code == 422


def test_geofence_arrival_resets_exit_check(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    r = c.put(f"/v1/vehicles/{vid}/geofence", json={"name": "Trường TH Kim Đồng", "lat": 10.78, "lon": 106.70, "radius_m": 150}, headers=h)
    assert r.status_code == 200 and r.json()["in_geofence"] is False
    t = {"seat": "rear_left", "person_conf": 0.8, "locked": False, "cabin_temp": 30}
    far = c.post(f"/v1/vehicles/{vid}/telemetry", json={**t, "lat": 10.70, "lon": 106.70}, headers=h).json()
    assert far["in_geofence"] is False
    near = c.post(f"/v1/vehicles/{vid}/telemetry", json={**t, "lat": 10.7801, "lon": 106.7001}, headers=h).json()
    assert near["in_geofence"] is True and near["exit_check"]["pending"] and near["exit_check"]["location"] == "Trường TH Kim Đồng"
    c.post(f"/v1/vehicles/{vid}/exit-check/confirm", headers=h)
    again = c.post(f"/v1/vehicles/{vid}/telemetry", json={**t, "lat": 10.7801, "lon": 106.7001}, headers=h).json()
    assert not again["exit_check"]["pending"]  # still the same stop


PNG = b"\x89PNG\r\n\x1a\n" + b"0" * 64


def test_location_route_and_ws(env, tmp_path, monkeypatch):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    r = c.post(f"/v1/location", json={"vehicle_id": vid, "lat": 10.77, "lon": 106.7, "heading": 90}, headers=h).json()
    assert r["coords"]["lat"] == 10.77 and r["stale"] is False
    c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "route_start"}, headers=h)
    a = c.get(f"/v1/vehicles/{vid}/location", headers=h).json()
    clock.t += 60
    b = c.get(f"/v1/vehicles/{vid}/location", headers=h).json()
    assert a["moving"] and b["coords"]["progress"] > a["coords"]["progress"] and b["destination"]["name"]
    clock.t += 120
    done = c.get(f"/v1/vehicles/{vid}/location", headers=h).json()
    assert not done["moving"] and done["coords"]["progress"] == 1.0
    with c.websocket_connect(f"/ws/vehicles/{vid}", headers=h) as ws:
        msg = ws.receive_json()
        assert msg["type"] == "vehicle" and msg["location"]["vehicle_id"] == vid
    with pytest.raises(Exception):
        with c.websocket_connect(f"/ws/vehicles/{vid}") as ws:  # no token
            ws.receive_json()


def test_alerts_trips_photo(env, tmp_path, monkeypatch):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    from app import main
    monkeypatch.setattr(main, "MEDIA_DIR", str(tmp_path))
    c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "critical"}, headers=h)
    al = c.get("/v1/alerts", headers=h).json()
    assert al and al[0]["status"] == "open"
    ack = c.post(f"/v1/alerts/{al[0]['id']}/acknowledge", headers=h).json()
    assert ack["status"] == "open" and ack["viewed_at"]  # acknowledging never resolves
    kid = c.post("/v1/children", json={"name": "An", "cls": "2A", "seat": "left"}, headers=h).json()[0]
    t = c.post(f"/v1/trips/{kid['id']}/pickup", json={"vehicle_id": vid}, headers=h).json()
    assert t["stage"] == "boarded" and t["log"][0]["source"] == "Ghi nhận thủ công"
    still = c.post(f"/v1/trips/{kid['id']}/dropoff", json={"vehicle_id": vid}, headers=h)
    assert still.status_code == 409 and still.json()["detail"]["code"] == "still_detected"  # camera still sees someone
    t = c.post(f"/v1/trips/{kid['id']}/dropoff", json={"vehicle_id": vid, "cabin_checked": True}, headers=h).json()
    assert t["stage"] == "arrived" and len(t["log"]) == 2
    assert c.get("/v1/alerts", headers=h).json()[0]["status"] == "open"  # a trip record never closes an incident
    assert c.post(f"/v1/media/photo?vehicle_id={vid}", content=PNG, headers=h).json()["type"] == "png"
    assert c.post(f"/v1/media/photo?vehicle_id={vid}", content=b"not an image", headers=h).status_code == 415
    assert c.post(f"/v1/media/photo?vehicle_id={vid}", content=b"", headers=h).status_code == 422
    assert len(list(tmp_path.iterdir())) == 1
    photos = c.get(f"/v1/vehicles/{vid}/photos", headers=h).json()
    assert len(photos) == 1 and photos[0]["type"] == "png"
    got = c.get(f"/v1/vehicles/{vid}/photos/{photos[0]['id']}", headers=h)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.content == PNG
    assert c.get(f"/v1/vehicles/{vid}/photos/img_nope", headers=h).status_code == 404
    assert c.get(f"/v1/vehicles/{vid}/photos/..%2Fx", headers=h).status_code in (404, 422)


def test_trip_follows_route(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    c.post("/v1/children", json={"name": "An", "cls": "2A", "seat": "left"}, headers=h)
    c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "route_start"}, headers=h)
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]
    assert t["stage"] == "enroute" and t["progress_known"] and t["school"] and t["vehicle_coords"]
    first = t["progress"]
    clock.t += 60
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]
    assert t["progress"] > first and t["destination"]["lat"]
    clock.t += 90  # the drive ends: arrival is recorded by the server, not by anyone opening a screen
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]
    assert t["stage"] == "arrived" and t["log"][0]["source"] == "Vị trí xe" and t["progress"] == 100


def test_phone_multi_detection(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    body = {"detections": [{"seat": "rear_left", "kind": "person", "conf": 0.9}, {"seat": "rear_right", "kind": "pet", "conf": 0.7},
                           {"seat": "rear_mid", "kind": "person", "conf": 0.3}],
            "items": [{"name": "Ba lô", "seat": "rear_mid", "conf": 0.8}, {"name": "Chai nước", "seat": "rear_mid", "conf": 0.2}],
            "model": "apple-vision", "locked": True, "cabin_temp": 31}
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json=body, headers=h).json()
    cab = r["cabin"]                                              # one zone: counts, no seats
    assert cab["occ"] and cab["people"] == 1 and cab["pets"] == 1 and cab["kind"] == "person" and r["detector"] == "apple-vision"
    assert "seats" not in r
    cam = c.get(f"/v1/vehicles/{vid}/camera", headers=h).json()
    assert len(cam["detections"]) == 2 and [i["name"] for i in cam["items"]] == ["Ba lô"]
    assert {d["label"] for d in cam["detections"]} == {"Người", "Thú cưng"} and "seat" not in cam["items"][0]
    # a detection anywhere in the cabin counts, with or without a seat
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [{"kind": "person", "conf": 0.9, "age": "child"}], "locked": True}, headers=h).json()
    assert r["cabin"]["children"] == 1 and r["verdict"]["sub"].startswith("Thấy 1 người")
    assert c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [{"seat": "trunk", "kind": "person", "conf": 1}]}, headers=h).status_code == 422


def test_age_hint_never_changes_the_verdict(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    levels = {}
    for age in (None, "adult", "child", "unknown"):
        det = {"seat": "rear_left", "kind": "person", "conf": 0.9}
        if age:
            det["age"] = age
        r = c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [det], "locked": True, "cabin_temp": 33}, headers=h).json()
        levels[age] = r["verdict"]["level"]
    assert set(levels.values()) == {"warning"}  # an "adult" guess must not downgrade or hide the alert
    cam = c.get(f"/v1/vehicles/{vid}/camera", headers=h).json()
    assert cam["detections"][0]["age"] == "unknown"
    assert c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [{"seat": "rear_left", "kind": "person", "conf": 0.9, "age": "teen"}]}, headers=h).status_code == 422


def test_simulator_paused_while_phone_is_the_source(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    assert c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "warning"}, headers=h).status_code == 200
    c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [], "locked": True}, headers=h)
    r = c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "critical"}, headers=h)
    assert r.status_code == 409 and r.json()["detail"]["code"] == "sim_paused"
    c.delete(f"/v1/vehicles/{vid}/telemetry", headers=h)
    assert c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "critical"}, headers=h).status_code == 200


def test_engine_on_pauses_and_engine_off_alerts(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    det = {"detections": [{"seat": "rear_mid", "kind": "person", "conf": 0.8}], "locked": True, "cabin_temp": 30}
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json={**det, "engine_on": True}, headers=h).json()
    assert r["verdict"]["level"] == "paused" and r["incident"] is None
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json={**det, "engine_on": False}, headers=h).json()
    assert r["verdict"]["level"] == "warning" and r["incident"]["status"] == "open"
    first = r["incident"]["id"]
    # An old open incident swallows later detections: no new incident (so no new notification) until it is closed.
    c.post(f"/v1/vehicles/{vid}/telemetry", json={**det, "engine_on": False, "detections": []}, headers=h)
    r = c.post(f"/v1/vehicles/{vid}/telemetry", json={**det, "engine_on": False}, headers=h).json()
    assert r["incident"]["id"] == first


def test_live_mode_without_real_data_is_never_safe(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "safe"}, headers=h)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] == "safe"  # demo mode
    c.put("/v1/me/settings", json={"demo_mode": False}, headers=h)
    r = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert r["verdict"]["level"] == "unknown" and r["no_real_data"] and not r["verdict"]["current"] and r["incident"] is None
    assert c.get("/v1/vehicles", headers=h).json()[0]["level"] == "unknown"
    c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [], "locked": True, "cabin_temp": 25}, headers=h)
    r = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert r["verdict"]["level"] == "safe" and not r["no_real_data"]  # a real source reports


def test_trip_resets_each_day(env):
    c, clock = env
    h = login(c)
    vid = link(c, h)
    kid = c.post("/v1/children", json={"name": "An", "cls": "2A", "seat": "left"}, headers=h).json()[0]
    c.post(f"/v1/trips/{kid['id']}/pickup", json={"vehicle_id": vid}, headers=h)
    assert c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]["stage"] == "boarded"
    clock.t += 36 * 3600
    t = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]
    assert t["stage"] == "waiting" and t["log"] == []


def test_otp_is_rate_limited(env):
    c, clock = env
    from app import main
    main.OTP_SENT.clear()
    codes = [c.post("/v1/auth/otp", json={"phone": "0911222333"}).status_code for _ in range(7)]
    assert codes[:5] == [200] * 5 and codes[5:] == [429, 429]
    clock.t += 700
    assert c.post("/v1/auth/otp", json={"phone": "0911222333"}).status_code == 200


def test_cabin_is_one_zone_and_old_seat_state_is_folded_in(env):
    """No seats: whatever the device sees anywhere counts, and state saved with five seats keeps every occupant."""
    from app import logic
    old = logic.base_state()
    old["seats"] = {"driver": {"occ": False, "conf": 0.0, "kind": None}, "rear_left": {"occ": True, "conf": 0.8, "kind": "pet"},
                    "rear_right": {"occ": True, "conf": 0.7, "kind": "person", "age": "child"}}
    old["items"] = [{"name": "Ba lô", "seat": "rear_mid", "conf": 0.9}]
    st = logic.normalise_seats(old)
    cab = st["seats"]["cabin"]
    assert set(st["seats"]) == {"cabin"} and cab["people"] == 1 and cab["pets"] == 1 and cab["children"] == 1
    assert cab["kind"] == "person"                                  # a child beside a pet is reported as a person
    assert "seat" not in st["items"][0]
    v = logic.evaluate(st)
    assert v["level"] in ("warning", "critical") and v["sub"].startswith("Thấy 1 người, 1 thú cưng") and "Ghế" not in v["sub"]
