"""Schema migrations, integrity, history, audit, retention, data rights and the production guards."""
import hashlib
import os
import sqlite3
import tempfile
import threading

import pytest

from app import db, history, logic, main, migrations
from tests.test_api import env, link, login, sim  # noqa: F401  (fixture and helpers)
from tests.test_production import frame, prod, setup_car  # noqa: F401


def legacy_db(path: str) -> None:
    """A database as the first release left it: v1 schema, plaintext tokens, no foreign keys, a few orphans."""
    c = sqlite3.connect(path)
    c.executescript(migrations.V1)
    c.execute("INSERT INTO users(id,phone,name,created_at) VALUES('usr_a','0900000001','An',1)")
    c.execute("INSERT INTO vehicles(id,pair_code,model,plate,name,color,image) VALUES('veh_a','CS-A','VF 8','30A','Xe','white','vf8')")
    c.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES('mem_a','veh_a','usr_a','0900000001','An','owner','active',1)")
    c.execute("INSERT INTO tokens(token,user_id,created_at) VALUES('plain-token-123','usr_a',?)", (logic.now() + 1,))
    c.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES('mem_x','veh_gone',NULL,'0900000002','Ma','view','active',1)")
    c.execute("INSERT INTO events(vehicle_id,incident_id,at,kind,title,detail) VALUES('veh_a','inc_gone',1,'x','t','d')")
    c.execute("INSERT INTO otps(phone,code,expires_at) VALUES('0900000001','123456',9e12)")
    c.commit()
    c.close()


def test_old_database_upgrades_in_place_and_keeps_working_sessions(env):  # noqa: F811
    c, clock = env
    path = os.path.join(tempfile.mkdtemp(), "old.db")
    legacy_db(path)
    db.reset(path)
    conn = db.get_conn()
    assert conn.execute("PRAGMA user_version").fetchone()[0] == migrations.LATEST
    assert conn.execute("PRAGMA foreign_key_check").fetchall() == []
    assert conn.execute("SELECT COUNT(*) FROM members WHERE id='mem_x'").fetchone()[0] == 0           # orphan removed
    assert conn.execute("SELECT incident_id FROM events").fetchone()[0] is None                       # dangling pointer cleared
    stored = conn.execute("SELECT token_hash FROM tokens").fetchone()[0]
    assert stored == hashlib.sha256(b"plain-token-123").hexdigest()                                    # only the hash is kept
    assert "plain-token-123" not in str([tuple(r) for r in conn.execute("SELECT * FROM tokens")])
    assert conn.execute("SELECT COUNT(*) FROM otps").fetchone()[0] == 0                               # old plaintext codes dropped
    assert c.get("/v1/me", headers={"Authorization": "Bearer plain-token-123"}).status_code == 200    # the app stays signed in
    names = {r[0] for r in conn.execute("SELECT name FROM sqlite_master WHERE type='index'")}
    assert {"idx_members_vehicle", "idx_incidents_vehicle", "idx_events_vehicle", "idx_obs_vehicle_ts", "idx_audit_ts"} <= names
    assert db.get_conn().execute("PRAGMA journal_mode").fetchone()[0] == "wal"
    assert migrations.run(conn) == migrations.LATEST                                                  # idempotent


def test_foreign_keys_cascade_and_reject_orphans(env):  # noqa: F811
    c, clock = env
    h = login(c)
    vid = link(c, h)
    with pytest.raises(sqlite3.IntegrityError):
        with db.tx() as conn:
            conn.execute("INSERT INTO incidents(id,vehicle_id,level,status,revision,created_at,reason) VALUES('i','nope','warning','open',1,1,'x')")
    with db.tx() as conn:
        conn.execute("DELETE FROM vehicles WHERE id=?", (vid,))
    for table in ("members", "vehicle_state", "events"):
        assert db.one(f"SELECT COUNT(*) AS n FROM {table} WHERE vehicle_id=?", vid)["n"] == 0


def test_tokens_and_codes_are_not_stored_in_clear(env):  # noqa: F811
    c, clock = env
    code = c.post("/v1/auth/otp", json={"phone": "0903123789"}).json()["dev_code"]
    row = db.one("SELECT * FROM otps WHERE phone='0903123789'")
    assert code not in row["code_hash"] and len(row["code_hash"]) == 64
    assert c.post("/v1/auth/verify", json={"phone": "0903123789", "code": "000000"}).status_code == 400
    v = c.post("/v1/auth/verify", json={"phone": "0903123789", "code": code, "name": "Minh"}).json()
    assert v["token"] not in str([tuple(r) for r in db.all_("SELECT * FROM tokens")])
    h = {"Authorization": f"Bearer {v['token']}"}
    sessions = c.get("/v1/me/sessions", headers=h).json()
    assert len(sessions) == 1 and sessions[0]["current"] and "token" not in sessions[0]
    h2 = login(c)                                                                                       # a second device
    assert len(c.get("/v1/me/sessions", headers=h).json()) == 2
    assert c.post("/v1/auth/logout-all", headers=h).json()["revoked"] == 2
    assert c.get("/v1/me", headers=h2).status_code == 401


def test_history_audit_and_data_rights(env):  # noqa: F811
    c, clock = env
    h = login(c)
    vid = link(c, h)
    body = {"detections": [{"seat": "rear_left", "kind": "person", "conf": 0.9, "age": "child"}], "items": [{"name": "Ba lô", "seat": "rear_right", "conf": 0.8}],
            "camera_ok": True, "locked": True, "engine_on": False, "lat": 10.77, "lon": 106.69}
    assert c.post(f"/v1/vehicles/{vid}/telemetry", json=body, headers=h).status_code == 200
    clock.t += 3
    c.post(f"/v1/vehicles/{vid}/telemetry", json=body, headers=h)                                      # inside the 10 s gap: not stored twice
    clock.t += 20
    c.post(f"/v1/vehicles/{vid}/telemetry", json=body, headers=h)
    obs = c.get(f"/v1/vehicles/{vid}/observations", headers=h).json()
    assert len(obs["items"]) == 2 and obs["items"][0]["people"] == 1 and obs["items"][0]["children_hint"] == 1 and obs["items"][0]["items"] == 1
    assert "image" not in str(obs) and obs["retention_hours"] == 168
    assert len(c.get(f"/v1/vehicles/{vid}/track", headers=h).json()["points"]) == 2
    assert c.put("/v1/me/settings", json={"notify_warning": False}, headers=h).status_code == 200
    log = c.get(f"/v1/vehicles/{vid}/audit", headers=h).json()["items"]
    assert log is not None
    actions = {r["action"] for r in db.all_("SELECT action FROM audit_log")}
    assert "auth.login" in actions and "PUT /v1/me/settings" in actions
    assert db.one("SELECT COUNT(*) AS n FROM audit_log WHERE detail_json LIKE '%0903123789%'")["n"] == 0   # no phone numbers in the log
    # a second user may not read the audit log
    h2 = login(c, phone="0911000111", name="Khác")
    assert c.get(f"/v1/vehicles/{vid}/audit", headers=h2).status_code == 404
    export = c.get("/v1/me/export", headers=h).json()
    assert export["profile"]["name"] == "Minh" and export["vehicles"][0]["role"] == "owner"
    assert c.request("DELETE", "/v1/me", json={"confirm": "no"}, headers=h).status_code == 422
    assert c.request("DELETE", "/v1/me", json={"confirm": "XOA TAI KHOAN"}, headers=h).json()["vehicles"] == 1
    assert c.get("/v1/me", headers=h).status_code == 401
    assert db.one("SELECT COUNT(*) AS n FROM observations")["n"] == 0 and db.one("SELECT COUNT(*) AS n FROM vehicles WHERE id=?", vid)["n"] == 0
    assert db.one("SELECT COUNT(*) AS n FROM audit_log WHERE actor_name='Minh'")["n"] == 0


def test_photos_have_expiry_and_can_be_deleted(env, tmp_path, monkeypatch):  # noqa: F811
    c, clock = env
    monkeypatch.setattr(main, "MEDIA_DIR", str(tmp_path))
    h = login(c)
    vid = link(c, h)
    png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
    pid = c.post(f"/v1/media/photo?vehicle_id={vid}", content=png, headers=h).json()["id"]
    row = db.one("SELECT * FROM media WHERE id=?", pid)
    assert row["sha256"] == hashlib.sha256(png).hexdigest() and row["expires_at"] > clock.t
    assert [p["id"] for p in c.get(f"/v1/vehicles/{vid}/photos", headers=h).json()] == [pid]
    assert c.delete(f"/v1/vehicles/{vid}/photos/{pid}", headers=h).json() == {"ok": True}
    assert not list(tmp_path.iterdir()) and c.get(f"/v1/vehicles/{vid}/photos/{pid}", headers=h).status_code == 404
    pid2 = c.post(f"/v1/media/photo?vehicle_id={vid}", content=png, headers=h).json()["id"]
    clock.t += history.RETENTION["media"] + 5
    assert history.purge(str(tmp_path))["media"] == 1 and not list(tmp_path.iterdir())
    assert c.get(f"/v1/vehicles/{vid}/photos", headers=h).json() == []


def test_retention_purges_every_table_past_its_deadline(env):  # noqa: F811
    c, clock = env
    h = login(c)
    vid = link(c, h)
    with db.tx() as conn:
        conn.execute("INSERT INTO observations(vehicle_id,ts,camera_ok,people) VALUES(?,?,1,0)", (vid, clock.t - history.RETENTION["observations"] - 10))
        conn.execute("INSERT INTO observations(vehicle_id,ts,camera_ok,people) VALUES(?,?,1,0)", (vid, clock.t - 60))
        conn.execute("INSERT INTO locations(vehicle_id,ts,lat,lon) VALUES(?,?,1,1)", (vid, clock.t - history.RETENTION["locations"] - 10))
        conn.execute("INSERT INTO audit_log(ts,action,outcome) VALUES(?,?,?)", (clock.t - history.RETENTION["audit"] - 10, "old", "ok"))
        conn.execute("INSERT INTO otps(phone,code_hash,expires_at) VALUES('0900000009','x',?)", (clock.t - 1,))
    counts = history.purge(tempfile.mkdtemp())
    assert counts["observations"] == 1 and counts["locations"] == 1 and counts["audit_log"] == 1 and counts["otps"] == 1
    assert db.one("SELECT COUNT(*) AS n FROM observations")["n"] == 1


def test_device_heartbeats_are_throttled_and_capped(prod):  # noqa: F811
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    for _ in range(5):
        c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert db.one("SELECT COUNT(*) AS n FROM heartbeats")["n"] == 1                                    # one per minute
    clock.t += 61
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    assert db.one("SELECT COUNT(*) AS n FROM heartbeats")["n"] == 2


def test_guards_headers_limits_and_rate(env, monkeypatch):  # noqa: F811
    c, clock = env
    r = c.get("/health")
    assert r.headers["x-content-type-options"] == "nosniff" and r.headers["x-frame-options"] == "DENY"
    assert c.get("/v1/config").headers["cache-control"] == "no-store"
    big = c.post("/v1/auth/otp", content=b"x" * (300 * 1024), headers={"content-type": "application/json"})
    assert big.status_code == 413
    monkeypatch.setattr(main.config, "RATE_AUTH_PER_MIN", 3)
    codes = [c.post("/v1/auth/otp", json={"phone": f"090000000{i}"}).status_code for i in range(5)]
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]
    main.RATE.clear()
    monkeypatch.setattr(main.config, "RATE_API_PER_MIN", 5)
    statuses = [c.get("/v1/vehicles", headers={"Authorization": "Bearer x"}).status_code for _ in range(7)]
    assert statuses.count(429) == 2


def test_reads_see_committed_writes_and_run_in_parallel(env):  # noqa: F811
    c, clock = env
    h = login(c)
    vid = link(c, h)
    errors: list[str] = []

    def reader() -> None:
        try:
            for _ in range(30):
                assert c.get(f"/v1/vehicles/{vid}/status", headers=h).status_code == 200
        except Exception as e:                     # pragma: no cover
            errors.append(repr(e))

    threads = [threading.Thread(target=reader) for _ in range(4)]
    [t.start() for t in threads]
    for i in range(4):                               # the app allows up to 4 children
        c.post("/v1/children", json={"name": f"Bé {i}", "seat": "left"}, headers=h)
    [t.join() for t in threads]
    assert not errors and len(c.get("/v1/children", headers=h).json()) == 4                           # a read right after a write sees it


def test_web_app_is_served_with_a_strict_policy(env):  # noqa: F811
    c, clock = env
    assert c.get("/", follow_redirects=False).status_code in (302, 307)
    r = c.get("/app/")
    assert r.status_code == 200 and "Cabin Noir" in r.text
    csp = r.headers["content-security-policy"]
    assert "frame-ancestors 'none'" in csp and "default-src 'self'" in csp and "'unsafe-eval'" not in csp
    assert r.headers["cache-control"] == "no-cache"
    assert c.get("/app/js/app.js").status_code == 200 and c.get("/app/manifest.webmanifest").status_code == 200
    assert c.get("/app/../app/main.py").status_code == 404                                             # no path escape out of the web folder
