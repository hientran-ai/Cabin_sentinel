"""Accounts, owner features, device channel, commands, evidence and incident actions over real HTTP + SQLite."""

from datetime import timedelta
from io import BytesIO

from PIL import Image

from tests.fleet_helpers import sensor, vision

PASSWORD = "correct-horse-battery"


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def signup(env, email, role="owner", name="Test User"):
    r = env.client.post("/api/v1/auth/register", json={"email": email, "password": PASSWORD, "full_name": name, "role": role})
    assert r.status_code == 201, r.text
    return r.json()


def sign_in(env, email, password=PASSWORD):
    r = env.client.post("/api/v1/auth/login", json={"email": email, "password": password, "use_cookie": False})
    assert r.status_code == 200, r.text
    return r.json()


def user_token(env, email, role="owner"):
    signup(env, email, role)
    return sign_in(env, email)["access_token"]


def make_admin(env, email="admin@example.com", tenant_id=None):
    env.store.create_user(email, PASSWORD, role="admin", full_name="Admin", tenant_id=tenant_id)
    return sign_in(env, email)["access_token"]


def make_operator(env, email="op@example.com"):
    env.store.create_user(email, PASSWORD, role="operator", full_name="Operator")
    return sign_in(env, email)["access_token"]


def add_vehicle(env, token, vehicle_id="MY-CAR-01", **extra):
    r = env.client.post("/api/v1/vehicles", json={"vehicle_id": vehicle_id, "name": "My car", **extra}, headers=auth(token))
    assert r.status_code == 201, r.text
    return r.json()


def pair(env, token, vehicle_id):
    code = env.client.post(f"/api/v1/vehicles/{vehicle_id}/pairing-code", headers=auth(token)).json()["pairing_code"]
    r = env.client.post("/api/v1/devices/pair", json={"pairing_code": code, "serial": "SN-0001", "firmware": "1.0.0"})
    assert r.status_code == 201, r.text
    return r.json()


def feed(env, device_token, vehicle_id, scenario, step):
    when = env.clock[0]
    s = env.client.post(f"/api/v1/vehicles/{vehicle_id}/sensors", json=sensor(vehicle_id, when, step, scenario), headers=auth(device_token))
    v = env.client.post(f"/api/v1/vehicles/{vehicle_id}/vision", json=vision(vehicle_id, when, step, scenario), headers=auth(device_token))
    assert s.status_code == 200 and v.status_code == 200, (s.text, v.text)


# -- authentication -------------------------------------------------------------------------
def test_login_refresh_rotation_reuse_and_logout(env):
    signup(env, "a@example.com")
    first = sign_in(env, "a@example.com")
    assert env.client.get("/api/v1/auth/me", headers=auth(first["access_token"])).json()["role"] == "owner"
    second = env.client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}).json()
    assert second["access_token"] != first["access_token"]
    # Presenting the rotated token again is treated as theft: the whole family dies.
    assert env.client.post("/api/v1/auth/refresh", json={"refresh_token": first["refresh_token"]}).status_code == 401
    assert env.client.get("/api/v1/auth/me", headers=auth(second["access_token"])).status_code == 403
    third = sign_in(env, "a@example.com")
    assert env.client.post("/api/v1/auth/logout", headers=auth(third["access_token"])).status_code == 204
    assert env.client.get("/api/v1/auth/me", headers=auth(third["access_token"])).status_code == 403


def test_access_token_expires_and_wrong_password_locks_account(env):
    signup(env, "b@example.com")
    token = sign_in(env, "b@example.com")["access_token"]
    env.clock[0] += timedelta(minutes=16)
    assert env.client.get("/api/v1/auth/me", headers=auth(token)).status_code == 403
    for _ in range(5):
        assert env.client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": "nope"}).status_code == 401
    locked = env.client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": PASSWORD})
    assert locked.status_code == 401 and "locked" in locked.json()["detail"]
    env.clock[0] += timedelta(minutes=16)
    assert env.client.post("/api/v1/auth/login", json={"email": "b@example.com", "password": PASSWORD}).status_code == 200


def test_cookie_session_requires_csrf_and_hides_refresh_token(env):
    signup(env, "c@example.com")
    r = env.client.post("/api/v1/auth/login", json={"email": "c@example.com", "password": PASSWORD})
    assert "refresh_token" not in r.json()
    assert "httponly" in r.headers["set-cookie"].lower()
    csrf = r.json()["csrf_token"]
    assert env.client.post("/api/v1/auth/refresh").status_code == 403
    ok = env.client.post("/api/v1/auth/refresh", headers={"X-CSRF-Token": csrf})
    assert ok.status_code == 200 and ok.json()["access_token"]
    env.client.cookies.clear()


def test_signup_can_be_disabled_and_passwords_are_validated(env, monkeypatch):
    short = env.client.post("/api/v1/auth/register", json={"email": "d@example.com", "password": "short", "full_name": "D"})
    assert short.status_code == 422
    signup(env, "d@example.com")
    dup = env.client.post("/api/v1/auth/register", json={"email": "D@example.com", "password": PASSWORD, "full_name": "D"})
    assert dup.status_code == 409
    from src.config import get_settings
    monkeypatch.setattr(get_settings(), "allow_signup", False)
    assert env.client.post("/api/v1/auth/register", json={"email": "e@example.com", "password": PASSWORD, "full_name": "E"}).status_code == 403


# -- profile, notifications, emergency contact ------------------------------------------------
def test_profile_notifications_and_contact_verification(env):
    token = user_token(env, "p@example.com")
    profile = env.client.put("/api/v1/me/profile", json={"full_name": "Nguyen Van A", "phone": "+84 912 345 678", "language": "en"}, headers=auth(token)).json()
    assert profile["full_name"] == "Nguyen Van A" and profile["language"] == "en"
    assert env.client.get("/api/v1/me/profile", headers=auth(token)).json()["phone"] == "+84 912 345 678"
    default = env.client.get("/api/v1/me/notification-settings", headers=auth(token)).json()
    assert default["critical_overrides_quiet_hours"] is True
    saved = env.client.put("/api/v1/me/notification-settings", json={"push": False, "sms": True, "quiet_hours": {"enabled": True, "start": "23:00", "end": "06:30"}}, headers=auth(token)).json()
    assert saved["sms"] is True and env.client.get("/api/v1/me/notification-settings", headers=auth(token)).json()["quiet_hours"]["start"] == "23:00"
    assert env.client.put("/api/v1/me/notification-settings", json={"quiet_hours": {"start": "25:99"}}, headers=auth(token)).status_code == 422

    contact = env.client.post("/api/v1/me/emergency-contacts", json={"full_name": "Mom", "phone": "0912345678"}, headers=auth(token)).json()
    assert contact["verified"] is False
    code = env.client.post(f"/api/v1/me/emergency-contacts/{contact['contact_id']}/verification", headers=auth(token)).json()["dev_code"]
    bad = "000000" if code != "000000" else "111111"
    assert env.client.post(f"/api/v1/me/emergency-contacts/{contact['contact_id']}/verification/confirm", json={"code": bad}, headers=auth(token)).status_code == 422
    done = env.client.post(f"/api/v1/me/emergency-contacts/{contact['contact_id']}/verification/confirm", json={"code": code}, headers=auth(token)).json()
    assert done["verified"] is True
    # Changing the number invalidates the verification.
    changed = env.client.patch(f"/api/v1/me/emergency-contacts/{contact['contact_id']}", json={"phone": "0999999999"}, headers=auth(token)).json()
    assert changed["verified"] is False
    assert env.client.delete(f"/api/v1/me/emergency-contacts/{contact['contact_id']}", headers=auth(token)).status_code == 204


def test_profile_needs_persistent_account_and_isolated_per_user(env):
    demo = env.client.post("/api/v1/auth/demo-login", json={"role": "owner", "subject": "demo-owner"}).json()["access_token"]
    assert env.client.get("/api/v1/me/profile", headers=auth(demo)).status_code == 404
    a, b = user_token(env, "a1@example.com"), user_token(env, "b1@example.com")
    env.client.post("/api/v1/me/emergency-contacts", json={"full_name": "Only A", "phone": "0912345678"}, headers=auth(a))
    assert env.client.get("/api/v1/me/emergency-contacts", headers=auth(b)).json()["contacts"] == []


# -- vehicles, pairing, device channel -----------------------------------------------------------
def test_owner_adds_pairs_and_manages_vehicle_with_isolation(env):
    owner, other = user_token(env, "o1@example.com"), user_token(env, "o2@example.com")
    vehicle = add_vehicle(env, owner)
    assert vehicle["owner_id"] and env.client.get("/api/v1/vehicles", headers=auth(owner)).json()["vehicles"][0]["vehicle_id"] == "MY-CAR-01"
    assert env.client.get("/api/v1/vehicles", headers=auth(other)).json()["vehicles"] == []
    assert env.client.get("/api/v1/vehicles/MY-CAR-01/state", headers=auth(other)).status_code == 403
    assert env.client.patch("/api/v1/vehicles/MY-CAR-01", json={"name": "x"}, headers=auth(other)).status_code == 403
    renamed = env.client.patch("/api/v1/vehicles/MY-CAR-01", json={"name": "Family car", "plate": "30A-123.45"}, headers=auth(owner)).json()
    assert renamed["name"] == "Family car"
    assert env.client.patch("/api/v1/vehicles/MY-CAR-01", json={"owner_id": "x"}, headers=auth(owner)).status_code == 403
    assert env.client.post("/api/v1/vehicles", json={"vehicle_id": "MY-CAR-01", "name": "dup"}, headers=auth(owner)).status_code == 409
    assert env.client.post("/api/v1/vehicles", json={"vehicle_id": "VF8-DEMO-01", "name": "clash"}, headers=auth(owner)).status_code == 409
    retired = env.client.delete("/api/v1/vehicles/MY-CAR-01", headers=auth(owner)).json()
    assert retired["status"] == "retired"
    assert env.client.get("/api/v1/vehicles/MY-CAR-01/state", headers=auth(owner)).status_code == 403


def test_demo_vehicle_is_read_only_for_demo_owner(env):
    demo = env.client.post("/api/v1/auth/demo-login", json={"role": "owner", "subject": "demo-owner"}).json()["access_token"]
    r = env.client.patch("/api/v1/vehicles/VF8-DEMO-01", json={"name": "x"}, headers=auth(demo))
    assert r.status_code == 409 and "read-only" in r.json()["detail"]


def test_pairing_issues_device_token_scoped_to_its_vehicle_only(env):
    owner = user_token(env, "dev@example.com")
    add_vehicle(env, owner, "CAR-A")
    add_vehicle(env, owner, "CAR-B")
    device = pair(env, owner, "CAR-A")
    token = device["device_token"]
    feed(env, token, "CAR-A", "SAFE", 1)
    wrong = env.client.post("/api/v1/vehicles/CAR-B/sensors", json=sensor("CAR-B", env.clock[0], 1, "SAFE"), headers=auth(token))
    assert wrong.status_code == 403
    hb = env.client.post("/api/v1/device/heartbeat", json={"firmware": "1.0.1", "battery_pct": 88, "rssi_dbm": -60}, headers=auth(token))
    assert hb.status_code == 200
    # The code is single use; a second pairing for the same vehicle revokes the first credential.
    code = env.client.post("/api/v1/vehicles/CAR-A/pairing-code", headers=auth(owner)).json()["pairing_code"]
    second = env.client.post("/api/v1/devices/pair", json={"pairing_code": code, "serial": "SN-0002"}).json()
    assert env.client.post("/api/v1/device/heartbeat", json={}, headers=auth(token)).status_code == 403
    assert env.client.post("/api/v1/device/heartbeat", json={}, headers=auth(second["device_token"])).status_code == 200
    assert env.client.post("/api/v1/devices/pair", json={"pairing_code": code, "serial": "SN-0003"}).status_code == 422


def test_pairing_code_expires(env):
    owner = user_token(env, "exp@example.com")
    add_vehicle(env, owner, "CAR-X")
    code = env.client.post("/api/v1/vehicles/CAR-X/pairing-code", headers=auth(owner)).json()["pairing_code"]
    env.clock[0] += timedelta(minutes=16)
    assert env.client.post("/api/v1/devices/pair", json={"pairing_code": code, "serial": "SN-9"}).status_code == 422


def test_inventory_vehicle_claim_flow(env):
    admin = make_admin(env)
    created = env.client.post("/api/v1/vehicles", json={"vehicle_id": "INV-001", "name": "Fleet unit"}, headers=auth(admin)).json()
    assert created["claimed"] is False and created["claim_code"]
    owner = user_token(env, "claim@example.com")
    assert env.client.post("/api/v1/vehicles/claim", json={"vehicle_id": "INV-001", "claim_code": "wrong-code"}, headers=auth(owner)).status_code == 422
    claimed = env.client.post("/api/v1/vehicles/claim", json={"vehicle_id": "INV-001", "claim_code": created["claim_code"]}, headers=auth(owner)).json()
    assert claimed["claimed"] is True
    assert env.client.post("/api/v1/vehicles/claim", json={"vehicle_id": "INV-001", "claim_code": created["claim_code"]}, headers=auth(owner)).status_code == 422
    assert [v["vehicle_id"] for v in env.client.get("/api/v1/vehicles", headers=auth(owner)).json()["vehicles"]] == ["INV-001"]


# -- caregivers ------------------------------------------------------------------------------------------
def test_caregiver_invite_accept_assign_and_revoke(env):
    owner = user_token(env, "own@example.com")
    add_vehicle(env, owner, "CAR-1")
    add_vehicle(env, owner, "CAR-2")
    caregiver = user_token(env, "care@example.com", "caregiver")
    invite = env.client.post("/api/v1/me/caregivers/invites", json={"email": "care@example.com", "vehicle_ids": ["CAR-1"]}, headers=auth(owner)).json()
    assert env.client.get("/api/v1/vehicles", headers=auth(caregiver)).json()["vehicles"] == []
    other = user_token(env, "other@example.com", "caregiver")
    assert env.client.post("/api/v1/caregiver-invites/accept", json={"token": invite["invite_token"]}, headers=auth(other)).status_code == 403
    assert env.client.post("/api/v1/caregiver-invites/accept", json={"token": invite["invite_token"]}, headers=auth(caregiver)).status_code == 200
    assert [v["vehicle_id"] for v in env.client.get("/api/v1/vehicles", headers=auth(caregiver)).json()["vehicles"]] == ["CAR-1"]
    assert env.client.get("/api/v1/vehicles/CAR-2/state", headers=auth(caregiver)).status_code == 403
    # Caregivers cannot manage, command or share.
    assert env.client.patch("/api/v1/vehicles/CAR-1", json={"name": "x"}, headers=auth(caregiver)).status_code == 403
    assert env.client.post("/api/v1/vehicles/CAR-1/commands", json={"type": "horn"}, headers=auth(caregiver)).status_code == 403
    link = env.client.get("/api/v1/me/caregivers", headers=auth(owner)).json()["caregivers"][0]
    env.client.patch(f"/api/v1/me/caregivers/{link['link_id']}", json={"vehicle_ids": ["CAR-1", "CAR-2"]}, headers=auth(owner))
    assert len(env.client.get("/api/v1/vehicles", headers=auth(caregiver)).json()["vehicles"]) == 2
    # Only own vehicles may be shared.
    stranger = user_token(env, "stranger@example.com")
    assert env.client.post("/api/v1/me/caregivers/invites", json={"email": "care@example.com", "vehicle_ids": ["CAR-1"]}, headers=auth(stranger)).status_code == 403
    assert env.client.delete(f"/api/v1/me/caregivers/{link['link_id']}", headers=auth(owner)).status_code == 204
    assert env.client.get("/api/v1/vehicles", headers=auth(caregiver)).json()["vehicles"] == []
    assert env.client.delete(f"/api/v1/me/caregivers/{link['link_id']}", headers=auth(stranger)).status_code == 404


# -- telemetry and live --------------------------------------------------------------------------------------
def test_telemetry_series_and_live_session_metadata_only(env):
    owner = user_token(env, "tel@example.com")
    add_vehicle(env, owner, "CAR-T")
    token = pair(env, owner, "CAR-T")["device_token"]
    for step, scenario in enumerate(["SAFE", "WARNING", "CRITICAL"], start=1):
        feed(env, token, "CAR-T", scenario, step)
        env.clock[0] += timedelta(seconds=40)
    series = env.client.get("/api/v1/vehicles/CAR-T/telemetry?minutes=30&bucket_seconds=30", headers=auth(owner)).json()
    temps = [p["temperature_c"] for p in series["points"]]
    assert temps == [24.0, 28.0, 39.2]
    assert series["points"][0]["occupant_confidence"] == 0.0 and series["points"][-1]["occupant_confidence"] == 0.9
    other = user_token(env, "tel2@example.com")
    assert env.client.get("/api/v1/vehicles/CAR-T/telemetry", headers=auth(other)).status_code == 403

    env.clock[0] = env.clock[0]
    feed(env, token, "CAR-T", "CRITICAL", 4)
    live = env.client.post("/api/v1/vehicles/CAR-T/live-sessions", headers=auth(owner)).json()
    assert live["stream"] is None and live["raw_frames"] is False
    view = env.client.get(live["poll_url"], headers=auth(owner)).json()
    assert view["vision"]["detections"] and "image" not in str(view).lower()
    assert env.client.get(live["poll_url"], headers=auth(other)).status_code == 404
    assert env.client.delete(live["poll_url"], headers=auth(owner)).status_code == 204
    assert env.client.get(live["poll_url"], headers=auth(owner)).status_code == 404


# -- evidence ---------------------------------------------------------------------------------------------------
def png_bytes():
    buffer = BytesIO()
    Image.new("RGB", (8, 8), "gray").save(buffer, "PNG")
    return buffer.getvalue()


def test_evidence_upload_signed_url_expiry_and_retention(env):
    owner = user_token(env, "ev@example.com")
    add_vehicle(env, owner, "CAR-E")
    token = pair(env, owner, "CAR-E")["device_token"]
    files = {"image": ("blur.png", png_bytes(), "image/png")}
    assert env.client.post("/api/v1/vehicles/CAR-E/evidence", files=files, data={"privacy_processed": "false"}, headers=auth(token)).status_code == 422
    assert env.client.post("/api/v1/vehicles/CAR-E/evidence", files={"image": ("x.png", b"not an image", "image/png")},
                           data={"privacy_processed": "true"}, headers=auth(token)).status_code == 422
    assert env.client.post("/api/v1/vehicles/CAR-E/evidence", files=files, data={"privacy_processed": "true"}, headers=auth(owner)).status_code == 403
    meta = env.client.post("/api/v1/vehicles/CAR-E/evidence", files=files, data={"privacy_processed": "true", "incident_id": "inc-1"}, headers=auth(token)).json()
    assert meta["privacy_processed"] is True and meta["expires_at"]
    listing = env.client.get("/api/v1/vehicles/CAR-E/evidence?incident_id=inc-1", headers=auth(owner)).json()["evidence"]
    assert [e["evidence_id"] for e in listing] == [meta["evidence_id"]]
    url = env.client.post(f"/api/v1/evidence/{meta['evidence_id']}/signed-url", headers=auth(owner)).json()["url"]
    got = env.client.get(url)
    assert got.status_code == 200 and got.headers["content-type"] == "image/png" and got.headers["cache-control"] == "no-store"
    assert env.client.get(url[:-4] + "0000").status_code == 403
    other = user_token(env, "ev2@example.com")
    assert env.client.post(f"/api/v1/evidence/{meta['evidence_id']}/signed-url", headers=auth(other)).status_code == 403
    env.clock[0] += timedelta(minutes=3)
    assert env.client.get(url).status_code == 403  # signature expired
    env.clock[0] += timedelta(hours=73)
    owner = sign_in(env, "ev@example.com")["access_token"]
    assert env.client.get("/api/v1/vehicles/CAR-E/evidence", headers=auth(owner)).json()["evidence"] == []


# -- incidents -------------------------------------------------------------------------------------------------------
def critical_incident(env, owner, vehicle_id="CAR-I"):
    add_vehicle(env, owner, vehicle_id)
    token = pair(env, owner, vehicle_id)["device_token"]
    feed(env, token, vehicle_id, "CRITICAL", 1)
    current = env.client.get(f"/api/v1/vehicles/{vehicle_id}/incidents", headers=auth(owner)).json()["current"]
    assert current and current["status"] == "OPEN"
    return token, current


def test_owner_acknowledges_holds_and_resolves_incident(env):
    owner = user_token(env, "inc@example.com")
    token, incident = critical_incident(env, owner)
    base = f"/api/v1/vehicles/CAR-I/incidents/{incident['incident_id']}"
    acked = env.client.post(f"{base}/acknowledge", headers=auth(owner)).json()
    assert acked["acknowledged_at"]
    held = env.client.post(f"{base}/hold", json={"keep_active": True, "version": 0, "note": "kid still inside?"}, headers=auth(owner)).json()
    assert held["ops"]["keep_active"] is True and held["ops"]["version"] == 1
    assert env.client.post(f"{base}/hold", json={"keep_active": False, "version": 0}, headers=auth(owner)).status_code == 409  # stale version
    state = env.client.get("/api/v1/vehicles/CAR-I/incidents", headers=auth(owner)).json()["current"]
    resolve = {"revision": state["revision"], "cabin_checked": True}
    assert env.client.post(f"{base}/resolve", json=resolve, headers=auth(owner)).status_code == 409  # held
    env.client.post(f"{base}/hold", json={"keep_active": False, "version": 1}, headers=auth(owner))
    # Resolve still needs fresh, consistent empty-cabin evidence: the cabin is not empty yet.
    assert env.client.post(f"{base}/resolve", json=resolve, headers=auth(owner)).status_code == 422
    assert env.client.post(f"{base}/resolve", json={"revision": 1, "cabin_checked": False}, headers=auth(owner)).status_code == 422
    other = user_token(env, "inc2@example.com")
    assert env.client.post(f"{base}/acknowledge", headers=auth(other)).status_code == 403


def test_caregiver_can_acknowledge_only_when_allowed(env):
    owner = user_token(env, "inc3@example.com")
    _, incident = critical_incident(env, owner)
    caregiver = user_token(env, "cg@example.com", "caregiver")
    invite = env.client.post("/api/v1/me/caregivers/invites", json={"email": "cg@example.com", "vehicle_ids": ["CAR-I"]}, headers=auth(owner)).json()
    env.client.post("/api/v1/caregiver-invites/accept", json={"token": invite["invite_token"]}, headers=auth(caregiver))
    base = f"/api/v1/vehicles/CAR-I/incidents/{incident['incident_id']}"
    assert env.client.post(f"{base}/acknowledge", headers=auth(caregiver)).status_code == 403
    env.client.patch(f"/api/v1/me/caregivers/{invite['link_id']}", json={"vehicle_ids": ["CAR-I"], "can_acknowledge": True}, headers=auth(owner))
    assert env.client.post(f"{base}/acknowledge", headers=auth(caregiver)).status_code == 200
    assert env.client.post(f"{base}/hold", json={"keep_active": True, "version": 0}, headers=auth(caregiver)).status_code == 403


# -- reactive commands -----------------------------------------------------------------------------------------------------
def test_command_lifecycle_requested_authorized_sent_acknowledged(env):
    owner = user_token(env, "cmd@example.com")
    token, _ = critical_incident(env, owner, "CAR-C")
    command = env.client.post("/api/v1/vehicles/CAR-C/commands", json={"type": "horn"}, headers=auth(owner)).json()
    assert command["status"] == "requested"
    assert env.client.post("/api/v1/vehicles/CAR-C/commands", json={"type": "horn"}, headers=auth(owner)).status_code == 409
    assert env.client.get("/api/v1/device/commands", headers=auth(token)).json()["commands"] == []  # not authorized yet
    assert env.client.post(f"/api/v1/device/commands/{command['command_id']}/ack", json={"ok": True}, headers=auth(token)).status_code == 409
    authorized = env.client.post(f"/api/v1/commands/{command['command_id']}/confirm", headers=auth(owner)).json()
    assert authorized["status"] == "authorized"
    pulled = env.client.get("/api/v1/device/commands", headers=auth(token)).json()["commands"]
    assert [c["status"] for c in pulled] == ["sent"]
    assert env.client.get("/api/v1/device/commands", headers=auth(token)).json()["commands"] == []  # handed over once
    acked = env.client.post(f"/api/v1/device/commands/{command['command_id']}/ack", json={"ok": True, "detail": "horn x3"}, headers=auth(token)).json()
    assert acked["status"] == "acknowledged"
    assert env.client.post(f"/api/v1/device/commands/{command['command_id']}/ack", json={"ok": True}, headers=auth(token)).status_code == 200
    assert env.client.post(f"/api/v1/device/commands/{command['command_id']}/ack", json={"ok": False}, headers=auth(token)).status_code == 409
    history = env.client.get(f"/api/v1/commands/{command['command_id']}", headers=auth(owner)).json()["history"]
    assert [h["status"] for h in history] == ["requested", "authorized", "sent", "acknowledged"]


def test_command_expiry_failure_and_cancel(env):
    owner = user_token(env, "cmd2@example.com")
    token, _ = critical_incident(env, owner, "CAR-D")
    c1 = env.client.post("/api/v1/vehicles/CAR-D/commands", json={"type": "horn"}, headers=auth(owner)).json()
    env.clock[0] += timedelta(minutes=3)
    assert env.client.get(f"/api/v1/commands/{c1['command_id']}", headers=auth(owner)).json()["status"] == "expired"
    assert env.client.post(f"/api/v1/commands/{c1['command_id']}/confirm", headers=auth(owner)).status_code == 409
    feed(env, token, "CAR-D", "CRITICAL", 2)
    c2 = env.client.post("/api/v1/vehicles/CAR-D/commands", json={"type": "horn"}, headers=auth(owner)).json()
    env.client.post(f"/api/v1/commands/{c2['command_id']}/confirm", headers=auth(owner))
    env.client.get("/api/v1/device/commands", headers=auth(token))
    failed = env.client.post(f"/api/v1/device/commands/{c2['command_id']}/ack", json={"ok": False, "detail": "relay fault"}, headers=auth(token)).json()
    assert failed["status"] == "failed" and failed["detail"] == "relay fault"
    c3 = env.client.post("/api/v1/vehicles/CAR-D/commands", json={"type": "horn"}, headers=auth(owner)).json()
    assert env.client.post(f"/api/v1/commands/{c3['command_id']}/cancel", headers=auth(owner)).json()["status"] == "canceled"


def test_unlock_needs_current_critical_and_sms_needs_verified_contact(env):
    owner = user_token(env, "cmd3@example.com")
    add_vehicle(env, owner, "CAR-U")
    token = pair(env, owner, "CAR-U")["device_token"]
    assert env.client.post("/api/v1/vehicles/CAR-U/commands", json={"type": "unlock"}, headers=auth(owner)).status_code == 409  # no data
    feed(env, token, "CAR-U", "SAFE", 1)
    assert env.client.post("/api/v1/vehicles/CAR-U/commands", json={"type": "unlock"}, headers=auth(owner)).status_code == 409
    env.clock[0] += timedelta(seconds=1)  # observations must be newer than the committed ones
    feed(env, token, "CAR-U", "CRITICAL", 2)
    assert env.client.post("/api/v1/vehicles/CAR-U/commands", json={"type": "sms"}, headers=auth(owner)).status_code == 409
    contact = env.client.post("/api/v1/me/emergency-contacts", json={"full_name": "Mom", "phone": "0912345678"}, headers=auth(owner)).json()
    code = env.client.post(f"/api/v1/me/emergency-contacts/{contact['contact_id']}/verification", headers=auth(owner)).json()["dev_code"]
    env.client.post(f"/api/v1/me/emergency-contacts/{contact['contact_id']}/verification/confirm", json={"code": code}, headers=auth(owner))
    assert env.client.post("/api/v1/vehicles/CAR-U/commands", json={"type": "sms"}, headers=auth(owner)).status_code == 201
    unlock = env.client.post("/api/v1/vehicles/CAR-U/commands", json={"type": "unlock"}, headers=auth(owner))
    assert unlock.status_code == 201, unlock.text
    # Data goes stale before confirmation: the owner can no longer authorize the unlock.
    env.clock[0] += timedelta(seconds=30)
    assert env.client.post(f"/api/v1/commands/{unlock.json()['command_id']}/confirm", headers=auth(owner)).status_code == 409


def test_operator_unlock_needs_a_second_person(env):
    owner = user_token(env, "cmd4@example.com")
    token, _ = critical_incident(env, owner, "CAR-F")
    operator, admin = make_operator(env), make_admin(env)
    command = env.client.post("/api/v1/vehicles/CAR-F/commands", json={"type": "unlock"}, headers=auth(operator)).json()
    assert env.client.post(f"/api/v1/commands/{command['command_id']}/confirm", headers=auth(operator)).status_code == 403
    assert env.client.post(f"/api/v1/commands/{command['command_id']}/confirm", headers=auth(admin)).status_code == 200
    rejected = env.client.post("/api/v1/vehicles/CAR-F/commands", json={"type": "horn"}, headers=auth(operator)).json()
    assert env.client.post(f"/api/v1/ops/commands/{rejected['command_id']}/reject", json={"reason": "false alarm"}, headers=auth(operator)).json()["status"] == "rejected"


def test_commands_can_be_disabled_by_deployment(env, monkeypatch):
    from src.config import get_settings
    owner = user_token(env, "cmd5@example.com")
    critical_incident(env, owner, "CAR-G")
    monkeypatch.setattr(get_settings(), "remote_commands_enabled", False)
    r = env.client.post("/api/v1/vehicles/CAR-G/commands", json={"type": "horn"}, headers=auth(owner))
    assert r.status_code == 423
    assert env.client.get("/api/v1/ops/commands", headers=auth(make_operator(env))).json()["enabled"] is False
