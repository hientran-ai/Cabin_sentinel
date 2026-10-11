"""Production mode: paired in-car device, real push/SMS delivery, no simulation."""
import pytest

from app import alerts, config, logic, main, push, sms
from tests.test_api import env  # noqa: F401  (fixture)


@pytest.fixture()
def prod(env, monkeypatch):  # noqa: F811
    c, clock = env
    for mod in (config,):
        monkeypatch.setattr(mod, "PRODUCTION", True)
        monkeypatch.setattr(mod, "DEV", False)
    monkeypatch.setattr(main, "PRODUCTION", True)
    monkeypatch.setattr(main, "DEV", False)
    monkeypatch.setattr(config, "OTP_NTFY_TOPIC", "admin-otp")
    sent: list[dict] = []
    monkeypatch.setattr(push, "_sender", lambda topic, title, msg, prio, tags, click: sent.append(
        {"topic": topic, "title": title, "msg": msg, "prio": prio}) or True)
    texts: list[tuple[str, str]] = []
    monkeypatch.setattr(sms, "_sender", lambda to, body: texts.append((to, body)) or (True, "http_201"))
    main.OTP_SENT.clear()
    main.RATE.clear()
    main.AUDIT_SYNC = True
    return c, clock, sent, texts


def login(c, sent, phone="0903123789", name="Minh"):
    r = c.post("/v1/auth/otp", json={"phone": phone}).json()
    assert "dev_code" not in r
    code = sent[-1]["msg"].split(": ")[1].split(" ")[0]   # the code only travels over the private channel
    assert sent[-1]["topic"] == "admin-otp"
    v = c.post("/v1/auth/verify", json={"phone": phone, "code": code, "name": name})
    assert v.status_code == 200, v.text
    return {"Authorization": f"Bearer {v.json()['token']}"}, v.json()["user"]["id"]


def setup_car(c, sent):
    h, uid = login(c, sent)
    v = c.post("/v1/vehicles", json={"name": "Xe nhà", "model": "VinFast VF 8", "plate": "30A-123.45", "color": "white"}, headers=h).json()
    vid = v["vehicle"]["id"]
    code = c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=h).json()["code"]
    p = c.post("/v1/device/pair", json={"code": code, "label": "iPhone cũ", "platform": "ios"}).json()
    return h, uid, vid, {"Authorization": f"Bearer {p['device_token']}"}, v


def frame(**kw):
    base = {"detections": [], "camera_ok": True, "model": "coreml-cabinyolo", "battery_pct": 80, "thermal": "nominal", "outside_temp": 31.0}
    base.update(kw)
    return base


def test_production_has_no_simulation_or_dev_shortcuts(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, v = setup_car(c, sent)
    assert c.post(f"/v1/sim/vehicles/{vid}/scenario", json={"name": "safe"}, headers=h).status_code == 404
    assert c.post(f"/v1/vehicles/{vid}/telemetry", json={"detections": [], "locked": True}, headers=h).status_code == 404
    assert c.post(f"/v1/vehicles/{vid}/climate", json={"action": "start"}, headers=h).status_code == 404
    cfg = c.get("/v1/config").json()
    assert cfg["production"] and not cfg["simulation"] and not cfg["climate"]
    assert v["no_real_data"] and v["verdict"]["level"] == "unknown"   # a new car with no device is never "safe"


def test_device_pairing_is_one_time_and_expires(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    vid = c.post("/v1/vehicles", json={"name": "A"}, headers=h).json()["vehicle"]["id"]
    code = c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=h).json()["code"]
    assert c.post("/v1/device/pair", json={"code": "ZZZZ-ZZZZ"}).status_code == 400
    ok = c.post("/v1/device/pair", json={"code": code, "label": "Máy"})
    assert ok.status_code == 200 and ok.json()["device_token"]
    assert c.post("/v1/device/pair", json={"code": code}).status_code == 400          # used up
    code2 = c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=h).json()["code"]
    clock.t += config.DEVICE_CODE_TTL_S + 1
    assert c.post("/v1/device/pair", json={"code": code2}).status_code == 400          # expired
    assert c.post("/v1/device/telemetry", json=frame()).status_code == 401              # no token
    other, _ = login(c, sent, phone="0911000111", name="Khác")
    assert c.post(f"/v1/vehicles/{vid}/devices/pairing", headers=other).status_code == 404   # not their car


def test_safe_needs_a_live_device_and_never_claims_what_it_cannot_see(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] == "unknown"
    r = c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert r.status_code == 200
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "safe" and s["source"] == "device" and not s["no_real_data"]
    assert s["cabin_temp"] is None                       # no cabin thermometer: no invented number
    assert [t["label"] for t in s["tiles"]][:2] == ["Cửa xe", "Ngoài trời"] and s["tiles"][0]["value"] == "Không rõ"
    clock.t += logic.STALE_AFTER_S + 5                   # device goes quiet
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "unknown" and not s["verdict"]["current"]


def test_person_in_hot_parked_car_alerts_the_family_even_when_nobody_opens_the_app(prod, monkeypatch):
    c, clock, sent, texts = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    for k, v in (("TWILIO_SID", "AC1"), ("TWILIO_TOKEN", "t"), ("TWILIO_FROM", "+10000000000")):
        monkeypatch.setattr(config, k, v)   # SMS becomes available after sign-in
    sent.clear()
    c.post("/v1/device/telemetry", json=frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9}]), headers=dh)
    alerts.run_once(main.refresh)                        # the worker, not a polling app, opens the incident
    inc = logic.open_incident(vid)
    assert inc is not None and inc["level"] == "critical"          # 31 °C outside >= 28: treated as dangerous
    mine = [m for m in sent if m["topic"] == push.topic_for(uid)]
    assert len(mine) == 1 and mine[0]["prio"] == 5 and "người trong xe" in mine[0]["title"]
    alerts.run_once(main.refresh)
    assert len([m for m in sent if m["topic"] == push.topic_for(uid)]) == 1     # no duplicate
    # one minute later nobody has looked: it repeats; SMS goes to the owner
    clock.t += 31
    c.post("/v1/device/telemetry", json=frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9}]), headers=dh)
    alerts.run_once(main.refresh)
    assert texts and texts[0][0] == "0903123789" and "kiểm tra xe" in texts[0][1]
    clock.t += 31
    c.post("/v1/device/telemetry", json=frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9}]), headers=dh)
    alerts.run_once(main.refresh)
    assert any("Vẫn chưa ai xem" in m["title"] for m in sent)
    esc = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()["escalation"]["steps"]
    states = {s["key"]: s["state"] for s in esc}
    assert states["push"] == "done" and states["sms_owner"] == "done"
    assert states["call_owner"] == "skipped"             # honest: automatic calls are not supported, not "done"


def test_escalation_reports_skipped_when_sms_is_not_configured(prod, monkeypatch):
    c, clock, sent, texts = prod
    monkeypatch.setattr(config, "TWILIO_SID", "")
    monkeypatch.setattr(config, "TWILIO_TOKEN", "")
    monkeypatch.setattr(config, "TWILIO_FROM", "")
    monkeypatch.setattr(config, "OTP_NTFY_TOPIC", "admin-otp")
    h, uid, vid, dh, _ = setup_car(c, sent)
    det = frame(detections=[{"seat": "rear_mid", "kind": "pet", "conf": 0.8}])
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    clock.t += 40
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    inc = logic.open_incident(vid)
    steps = {s["key"]: s for s in c.get(f"/v1/incidents/{inc['id']}", headers=h).json()["escalation"]["steps"]}
    assert steps["sms_owner"]["state"] == "skipped" and "SMS" in steps["sms_owner"]["detail"]
    assert not texts


def test_viewed_stops_escalation_and_only_a_confirmed_check_closes(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    det = frame(detections=[{"seat": "rear_left", "kind": "person", "conf": 0.9}])
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    inc = logic.open_incident(vid)
    c.post(f"/v1/incidents/{inc['id']}/view", headers=h)
    sent.clear()
    clock.t += 130
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    assert not [m for m in sent if "Vẫn chưa ai xem" in m["title"]]       # seen: no more nagging
    checks = ["seats", "floor", "trunk"]
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": logic.open_incident(vid)["revision"], "checks": checks}, headers=h).json()
    assert r["result"] == "rejected" and r["reject"]["code"] == "presence"     # still sees someone
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    rev = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()["revision"]      # the app re-reads before confirming
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": rev, "checks": checks}, headers=h).json()
    assert r["result"] == "resolved"
    alerts.run_once(main.refresh)
    assert any(m["title"] == "Đã đóng sự cố" for m in sent)


def test_lost_device_is_announced_once_and_recovery_too(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    alerts.run_once(main.refresh)
    sent.clear()
    clock.t += logic.STALE_AFTER_S + 10
    alerts.run_once(main.refresh)
    alerts.run_once(main.refresh)
    lost = [m for m in sent if "Mất kết nối thiết bị" in m["title"]]
    assert len(lost) == 1 and lost[0]["prio"] == 5
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    alerts.run_once(main.refresh)
    assert len([m for m in sent if "đã kết nối lại" in m["title"]]) == 1


def test_overheating_device_is_never_shown_as_safe(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(thermal="critical"), headers=dh)
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] == "unknown" and "quá nóng" in s["verdict"]["title"]
    assert s["protection"]["level"] == "partial"
    # but a person seen by an overheating device still raises the alarm
    c.post("/v1/device/telemetry", json=frame(thermal="critical", detections=[{"seat": "rear_mid", "kind": "person", "conf": 0.9}]), headers=dh)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] in ("warning", "critical")


def test_cool_day_without_cabin_sensor_is_a_warning_not_critical(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(outside_temp=20.0, detections=[{"seat": "rear_mid", "kind": "person", "conf": 0.9}]), headers=dh)
    v = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]
    assert v["level"] == "warning" and "chưa có cảm biến" in v["sub"]


def test_pause_is_capped_blocked_during_incident_and_ends_itself(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    person = frame(detections=[{"seat": "rear_mid", "kind": "person", "conf": 0.9}])
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 61}, headers=h).status_code == 422
    r = c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 10}, headers=h).json()
    assert r["verdict"]["level"] == "paused" and r["paused_until"]
    c.post("/v1/device/telemetry", json=person, headers=dh)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] == "paused"
    clock.t += 601
    c.post("/v1/device/telemetry", json=person, headers=dh)
    assert c.get(f"/v1/vehicles/{vid}/status", headers=h).json()["verdict"]["level"] in ("warning", "critical")   # resumed alone
    assert c.post(f"/v1/vehicles/{vid}/pause", json={"minutes": 10}, headers=h).status_code == 409                # incident open


def test_revoked_device_loses_access_and_push_topic_is_private(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    devs = c.get(f"/v1/vehicles/{vid}/devices", headers=h).json()
    assert len(devs) == 1 and devs[0]["label"] == "iPhone cũ"
    assert c.delete(f"/v1/vehicles/{vid}/devices/{devs[0]['id']}", headers=h).json() == []
    assert c.post("/v1/device/telemetry", json=frame(), headers=dh).status_code == 401
    p = c.get("/v1/me/push", headers=h).json()
    assert p["topic"].startswith("cs-") and len(p["topic"]) > 20 and p["subscribe_url"].endswith(p["topic"])
    other, uid2 = login(c, sent, phone="0911000111", name="Khác")
    assert c.get("/v1/me/push", headers=other).json()["topic"] != p["topic"]
    assert c.post("/v1/me/push/test", headers=h).json() == {"sent": True}


def test_school_trip_follows_the_device_and_flags_a_child_left_in_the_car(prod):
    c, clock, sent, texts = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    kid = c.post("/v1/children", json={"name": "Bin", "cls": "2A", "seat": "left"}, headers=h).json()[0]
    c.put(f"/v1/vehicles/{vid}/geofence", json={"name": "Trường", "lat": 21.0, "lon": 105.8, "radius_m": 150}, headers=h)
    seat = [{"seat": "rear_left", "kind": "person", "conf": 0.9, "age": "unknown"}]

    def stage():
        return c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]["stage"]

    c.post("/v1/device/telemetry", json=frame(detections=seat, engine_on=False, lat=21.05, lon=105.8), headers=dh)
    assert stage() == "waiting"                                   # sitting in a parked car is not a trip yet
    clock.t += 5
    c.post("/v1/device/telemetry", json=frame(detections=seat, engine_on=True, lat=21.04, lon=105.8), headers=dh)
    assert stage() == "enroute"                                   # seat occupied + car moving
    clock.t += 5
    c.post("/v1/device/telemetry", json=frame(detections=seat, engine_on=False, lat=21.0, lon=105.8), headers=dh)
    assert stage() == "arrived"                                   # parked inside the zone
    clock.t += 130
    c.post("/v1/device/telemetry", json=frame(detections=seat, engine_on=False, lat=21.0, lon=105.8), headers=dh)
    assert stage() == "leftin"
    log = c.get(f"/v1/vehicles/{vid}/trips", headers=h).json()[0]["log"]
    assert log[0]["source"] == "Camera trong xe" and "khóa" not in log[0]["title"]
    alerts.run_once(main.refresh)
    assert logic.open_incident(vid) is not None                   # the normal cabin alert is what actually notifies
    clock.t += 20
    c.post("/v1/device/telemetry", json=frame(detections=[], engine_on=False, lat=21.0, lon=105.8), headers=dh)
    clock.t += 15
    c.post("/v1/device/telemetry", json=frame(detections=[], engine_on=False, lat=21.0, lon=105.8), headers=dh)
    assert stage() == "arrived"
    assert logic.open_incident(vid) is not None                   # an empty seat does not close the incident by itself


def test_cors_allows_web_origin_without_credentials(env):  # noqa: F811
    client, _ = env
    ok = client.options("/v1/me", headers={"Origin": "https://cabinsentinel-mobile.pages.dev",
                                           "Access-Control-Request-Method": "GET", "Access-Control-Request-Headers": "authorization"})
    assert ok.headers.get("access-control-allow-origin") == "https://cabinsentinel-mobile.pages.dev"
    assert "access-control-allow-credentials" not in ok.headers
    bad = client.options("/v1/me", headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"})
    assert "access-control-allow-origin" not in bad.headers


def test_manual_override_closes_with_a_warning_and_a_new_incident_opens_if_person_still_seen(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    det = frame(detections=[{"seat": "rear_left", "kind": "person", "conf": 0.9}])
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    inc = logic.open_incident(vid)
    checks = ["seats", "floor", "trunk"]
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": inc["revision"], "checks": checks}, headers=h).json()
    assert r["result"] == "rejected" and r["reject"]["code"] == "presence"      # no override: still refused
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": inc["revision"], "checks": ["seats"], "override": True}, headers=h)
    assert r.status_code == 422                                               # override still needs all three checks
    r = c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": inc["revision"], "checks": checks, "override": True}, headers=h).json()
    assert r["result"] == "resolved" and "đóng thủ công" in r["resolved_by"]
    sent.clear()
    alerts.run_once(main.refresh)
    assert any("vẫn thấy người" in m["msg"] for m in sent if m["title"] == "Đã đóng sự cố")
    c.post("/v1/device/telemetry", json=det, headers=dh)                       # camera still sees the person
    alerts.run_once(main.refresh)
    again = logic.open_incident(vid)
    assert again and again["id"] != inc["id"]                                  # a new incident, nothing hidden
