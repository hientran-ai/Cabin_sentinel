"""Versioned schema migrations (PRAGMA user_version). Every database, new or old, goes through the same steps.

  v1  baseline: the schema the app shipped with (no foreign keys, no migration marker)
  v2  foreign keys with cascades on every relation, indexes on every lookup, Telegram link tables
  v3  observations (seat level history), locations, device heartbeats, audit log, media metadata with expiry
  v4  sign-in tokens and one-time codes are stored hashed (a leaked database file no longer holds working sessions)

Design borrowed from the team platform store (audit log columns, heartbeat cap, evidence expiry) and fixed where it fell short:
real incident lifecycle rows, foreign keys, indexes, migrations, and a retention deadline plus a deletion path for every new table.
"""
from __future__ import annotations

import hashlib
import sqlite3
from typing import Callable

LATEST = 9

V1 = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL, created_at REAL NOT NULL,
  settings TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS otps (phone TEXT PRIMARY KEY, code TEXT NOT NULL, expires_at REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY, pair_code TEXT UNIQUE NOT NULL, model TEXT NOT NULL, plate TEXT NOT NULL,
  name TEXT NOT NULL, color TEXT NOT NULL, image TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS link_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, vehicle_id TEXT NOT NULL, code TEXT NOT NULL, expires_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, user_id TEXT, phone TEXT NOT NULL, name TEXT NOT NULL,
  role TEXT NOT NULL, status TEXT NOT NULL, created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS vehicle_state (vehicle_id TEXT PRIMARY KEY, data TEXT NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS incidents (
  id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, level TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL,
  created_at REAL NOT NULL, viewed_at REAL, viewed_by TEXT, resolved_at REAL, resolved_by TEXT,
  seat TEXT, confidence REAL, cabin_temp REAL, reason TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL, incident_id TEXT, at REAL NOT NULL,
  kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS climate (vehicle_id TEXT PRIMARY KEY, data TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS children (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, name TEXT NOT NULL, cls TEXT NOT NULL, seat TEXT NOT NULL,
  pickup TEXT NOT NULL, dropoff TEXT NOT NULL, days TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, rel TEXT NOT NULL, phone TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS trips (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, child_id TEXT NOT NULL, stage TEXT NOT NULL, log TEXT NOT NULL, updated_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, secret_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL, platform TEXT NOT NULL,
  created_at REAL NOT NULL, last_seen REAL, revoked_at REAL, info TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS device_codes (code TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, created_by TEXT NOT NULL, expires_at REAL NOT NULL);
CREATE TABLE IF NOT EXISTS push_topics (user_id TEXT PRIMARY KEY, topic TEXT UNIQUE NOT NULL);
CREATE TABLE IF NOT EXISTS deliveries (
  id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT UNIQUE NOT NULL, kind TEXT NOT NULL, vehicle_id TEXT, incident_id TEXT,
  at REAL NOT NULL, status TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '', attempts INTEGER NOT NULL DEFAULT 1
);
"""

# v2: the same tables with foreign keys. Order matters: parents before children.
V2_TABLES: list[tuple[str, str]] = [
    ("tokens", "CREATE TABLE tokens (token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, created_at REAL NOT NULL)"),
    ("link_challenges", "CREATE TABLE link_challenges (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                        "vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, code TEXT NOT NULL, expires_at REAL NOT NULL)"),
    ("members", "CREATE TABLE members (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
                "user_id TEXT REFERENCES users(id) ON DELETE SET NULL, phone TEXT NOT NULL, name TEXT NOT NULL, role TEXT NOT NULL, "
                "status TEXT NOT NULL, created_at REAL NOT NULL)"),
    ("vehicle_state", "CREATE TABLE vehicle_state (vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE, data TEXT NOT NULL, updated_at REAL NOT NULL)"),
    ("incidents", "CREATE TABLE incidents (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
                  "level TEXT NOT NULL, status TEXT NOT NULL, revision INTEGER NOT NULL, created_at REAL NOT NULL, viewed_at REAL, "
                  "viewed_by TEXT, resolved_at REAL, resolved_by TEXT, seat TEXT, confidence REAL, cabin_temp REAL, reason TEXT NOT NULL)"),
    ("events", "CREATE TABLE events (id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
               "incident_id TEXT REFERENCES incidents(id) ON DELETE SET NULL, at REAL NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL)"),
    ("climate", "CREATE TABLE climate (vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE, data TEXT NOT NULL)"),
    ("children", "CREATE TABLE children (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, "
                 "cls TEXT NOT NULL, seat TEXT NOT NULL, pickup TEXT NOT NULL, dropoff TEXT NOT NULL, days TEXT NOT NULL)"),
    ("contacts", "CREATE TABLE contacts (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, rel TEXT NOT NULL, phone TEXT NOT NULL)"),
    ("trips", "CREATE TABLE trips (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
              "child_id TEXT NOT NULL REFERENCES children(id) ON DELETE CASCADE, stage TEXT NOT NULL, log TEXT NOT NULL, updated_at REAL NOT NULL)"),
    ("devices", "CREATE TABLE devices (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
                "secret_hash TEXT UNIQUE NOT NULL, label TEXT NOT NULL, platform TEXT NOT NULL, created_at REAL NOT NULL, last_seen REAL, "
                "revoked_at REAL, info TEXT NOT NULL DEFAULT '{}')"),
    ("device_codes", "CREATE TABLE device_codes (code TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
                     "created_by TEXT NOT NULL, expires_at REAL NOT NULL)"),
    ("push_topics", "CREATE TABLE push_topics (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, topic TEXT UNIQUE NOT NULL)"),
    ("telegram_links", "CREATE TABLE telegram_links (user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, chat_id TEXT NOT NULL, linked_at REAL NOT NULL)"),
    ("telegram_codes", "CREATE TABLE telegram_codes (code TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expires_at REAL NOT NULL)"),
]

# Orphans (rows whose parent is gone) cannot be kept under foreign keys. Counted and removed before the copy.
ORPHAN_RULES = [
    ("tokens", "user_id", "users", "id"), ("link_challenges", "user_id", "users", "id"), ("link_challenges", "vehicle_id", "vehicles", "id"),
    ("members", "vehicle_id", "vehicles", "id"), ("vehicle_state", "vehicle_id", "vehicles", "id"), ("incidents", "vehicle_id", "vehicles", "id"),
    ("events", "vehicle_id", "vehicles", "id"), ("climate", "vehicle_id", "vehicles", "id"), ("children", "owner_id", "users", "id"),
    ("contacts", "user_id", "users", "id"), ("trips", "vehicle_id", "vehicles", "id"), ("trips", "child_id", "children", "id"),
    ("devices", "vehicle_id", "vehicles", "id"), ("device_codes", "vehicle_id", "vehicles", "id"), ("push_topics", "user_id", "users", "id"),
]

V2_INDEXES = """
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_members_vehicle ON members(vehicle_id, status);
CREATE INDEX IF NOT EXISTS idx_members_user ON members(user_id, status);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
CREATE INDEX IF NOT EXISTS idx_incidents_vehicle ON incidents(vehicle_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_events_vehicle ON events(vehicle_id, at);
CREATE INDEX IF NOT EXISTS idx_events_incident ON events(incident_id);
CREATE INDEX IF NOT EXISTS idx_children_owner ON children(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(user_id);
CREATE INDEX IF NOT EXISTS idx_trips_vehicle ON trips(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_trips_child ON trips(child_id);
CREATE INDEX IF NOT EXISTS idx_devices_vehicle ON devices(vehicle_id, revoked_at);
CREATE INDEX IF NOT EXISTS idx_device_codes_vehicle ON device_codes(vehicle_id);
CREATE INDEX IF NOT EXISTS idx_telegram_chat ON telegram_links(chat_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_incident ON deliveries(incident_id);
CREATE INDEX IF NOT EXISTS idx_deliveries_at ON deliveries(at);
"""

V3 = """
CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, ts REAL NOT NULL,
  source TEXT, detector TEXT, camera_ok INTEGER NOT NULL, people INTEGER NOT NULL, children_hint INTEGER NOT NULL DEFAULT 0,
  pets INTEGER NOT NULL DEFAULT 0, items INTEGER NOT NULL DEFAULT 0, cabin_temp REAL, outside_temp REAL, engine_on INTEGER,
  level TEXT, seats_json TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_obs_vehicle_ts ON observations(vehicle_id, ts);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, ts REAL NOT NULL,
  lat REAL NOT NULL, lon REAL NOT NULL, accuracy_m REAL, heading REAL, source TEXT
);
CREATE INDEX IF NOT EXISTS idx_loc_vehicle_ts ON locations(vehicle_id, ts);
CREATE TABLE IF NOT EXISTS heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE, ts REAL NOT NULL,
  battery_pct INTEGER, charging INTEGER, thermal TEXT, platform TEXT
);
CREATE INDEX IF NOT EXISTS idx_hb_device ON heartbeats(device_id, id);
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts REAL NOT NULL, actor_id TEXT, actor_name TEXT, actor_role TEXT, vehicle_id TEXT,
  action TEXT NOT NULL, target TEXT, outcome TEXT NOT NULL, correlation_id TEXT, detail_json TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_audit_ts ON audit_log(ts);
CREATE INDEX IF NOT EXISTS idx_audit_vehicle ON audit_log(vehicle_id, ts);
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, kind TEXT NOT NULL DEFAULT 'photo',
  ext TEXT NOT NULL, sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, created_at REAL NOT NULL, expires_at REAL NOT NULL, uploaded_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_media_vehicle ON media(vehicle_id, created_at);
CREATE INDEX IF NOT EXISTS idx_media_expiry ON media(expires_at);
"""


def _exists(conn: sqlite3.Connection, name: str) -> bool:
    return conn.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?", (name,)).fetchone() is not None


def _columns(conn: sqlite3.Connection, name: str) -> list[str]:
    return [r[1] for r in conn.execute(f"PRAGMA table_info({name})")]


def _script(conn: sqlite3.Connection, text: str) -> None:
    """executescript() would commit our transaction, so run the statements one by one."""
    for stmt in text.split(";"):
        if stmt.strip():
            conn.execute(stmt)


def _m1(conn: sqlite3.Connection) -> None:
    _script(conn, V1)


def _m2(conn: sqlite3.Connection) -> None:
    """Rebuild each relational table with foreign keys (SQLite cannot add them in place), keeping every row that still has a parent."""
    for child, col, parent, pcol in ORPHAN_RULES:
        if _exists(conn, child):
            conn.execute(f"DELETE FROM {child} WHERE {col} IS NOT NULL AND {col} NOT IN (SELECT {pcol} FROM {parent})")
    conn.execute("UPDATE events SET incident_id=NULL WHERE incident_id IS NOT NULL AND incident_id NOT IN (SELECT id FROM incidents)")
    for name, create in V2_TABLES:
        if _exists(conn, name):
            old_cols = _columns(conn, name)
            conn.execute(f"ALTER TABLE {name} RENAME TO {name}__old")
            conn.execute(create)
            cols = ",".join(c for c in old_cols if c in _columns(conn, name))
            conn.execute(f"INSERT INTO {name}({cols}) SELECT {cols} FROM {name}__old")
            conn.execute(f"DROP TABLE {name}__old")
        else:
            conn.execute(create)
    _script(conn, V2_INDEXES)


def _m3(conn: sqlite3.Connection) -> None:
    _script(conn, V3)


def _m4(conn: sqlite3.Connection) -> None:
    """Tokens keep working: each stored token becomes its SHA-256 (the app still sends the original). One-time codes are just reissued."""
    rows = conn.execute("SELECT token, user_id, created_at FROM tokens").fetchall()
    conn.execute("DROP TABLE tokens")
    conn.execute("CREATE TABLE tokens (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                 "created_at REAL NOT NULL, agent TEXT)")
    for r in rows:
        conn.execute("INSERT INTO tokens(token_hash,user_id,created_at) VALUES(?,?,?)",
                     (hashlib.sha256(r["token"].encode()).hexdigest(), r["user_id"], r["created_at"]))
    conn.execute("DROP INDEX IF EXISTS idx_tokens_user")
    conn.execute("CREATE INDEX idx_tokens_user ON tokens(user_id)")
    conn.execute("DROP TABLE otps")
    conn.execute("CREATE TABLE otps (phone TEXT PRIMARY KEY, code_hash TEXT NOT NULL, expires_at REAL NOT NULL, attempts INTEGER NOT NULL DEFAULT 0)")


def _m5(conn: sqlite3.Connection) -> None:
    """Sign-in through the Telegram bot: a short-lived nonce ties the web page to a chat; the chat proves the phone by sharing its own contact."""
    conn.execute("CREATE TABLE IF NOT EXISTS telegram_logins (nonce TEXT PRIMARY KEY, phone TEXT NOT NULL, chat_id TEXT, "
                 "verified INTEGER NOT NULL DEFAULT 0, expires_at REAL NOT NULL)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_telegram_logins_chat ON telegram_logins(chat_id)")


def _m6(conn: sqlite3.Connection) -> None:
    """Cabin log: one row per left-behind episode, camera-blocked stretch or device-offline stretch, hash-chained per vehicle."""
    conn.execute("CREATE TABLE IF NOT EXISTS cabin_log (id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE, "
                 "kind TEXT NOT NULL, started_at REAL NOT NULL, ended_at REAL, seat TEXT, level TEXT, incident_id TEXT, outcome TEXT, "
                 "basis TEXT NOT NULL, detail TEXT NOT NULL DEFAULT '{}', prev_hash TEXT, hash TEXT)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cabin_log_vehicle ON cabin_log(vehicle_id, started_at)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_cabin_log_incident ON cabin_log(incident_id)")


def _m7(conn: sqlite3.Connection) -> None:
    """Web Push: browsers that turned notifications on (removed with the user, or when the browser drops them), and the server key."""
    conn.execute("CREATE TABLE IF NOT EXISTS web_push (endpoint TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                 "p256dh TEXT NOT NULL, auth TEXT NOT NULL, agent TEXT, created_at REAL NOT NULL, last_ok_at REAL)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_web_push_user ON web_push(user_id)")
    conn.execute("CREATE TABLE IF NOT EXISTS server_keys (name TEXT PRIMARY KEY, value TEXT NOT NULL)")


def _m8(conn: sqlite3.Connection) -> None:
    """Fixed pickup places ("Nhà", "Trường học") saved per person, so a school run can be set up with one tap."""
    conn.execute("CREATE TABLE IF NOT EXISTS places (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, "
                 "name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', lat REAL NOT NULL, lon REAL NOT NULL, radius_m INTEGER NOT NULL DEFAULT 150, "
                 "created_at REAL NOT NULL)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_places_user ON places(user_id)")


def _m9(conn: sqlite3.Connection) -> None:
    """Telegram alert cards (which message to edit when an incident changes) and the per-vehicle opt-in for alert photos.
    An alert photo is a frame the in-car device blurred itself; it is kept like other media but only for a day."""
    conn.execute("CREATE TABLE IF NOT EXISTS tg_alerts (incident_id TEXT NOT NULL REFERENCES incidents(id) ON DELETE CASCADE, "
                 "chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, level TEXT NOT NULL, created_at REAL NOT NULL, "
                 "PRIMARY KEY (incident_id, chat_id, message_id))")
    conn.execute("CREATE TABLE IF NOT EXISTS vehicle_prefs (vehicle_id TEXT PRIMARY KEY REFERENCES vehicles(id) ON DELETE CASCADE, "
                 "alert_photo INTEGER NOT NULL DEFAULT 0, changed_by TEXT, changed_at REAL)")
    cols = {r[1] for r in conn.execute("PRAGMA table_info(media)").fetchall()}
    if "incident_id" not in cols:
        conn.execute("ALTER TABLE media ADD COLUMN incident_id TEXT")


MIGRATIONS: list[tuple[int, Callable[[sqlite3.Connection], None]]] = [(1, _m1), (2, _m2), (3, _m3), (4, _m4), (5, _m5), (6, _m6), (7, _m7), (8, _m8), (9, _m9)]


def current(conn: sqlite3.Connection) -> int:
    v = conn.execute("PRAGMA user_version").fetchone()[0]
    if v == 0 and _exists(conn, "users"):
        return 1          # a database created before migrations existed is the v1 baseline
    return v


def run(conn: sqlite3.Connection) -> int:
    """Bring the database to LATEST. Foreign keys are off only while tables are rebuilt, then checked before they are turned back on."""
    ver = current(conn)
    for target, step in MIGRATIONS:
        if target <= ver:
            continue
        conn.execute("PRAGMA foreign_keys=OFF")
        try:
            conn.execute("BEGIN IMMEDIATE")
            step(conn)
            bad = conn.execute("PRAGMA foreign_key_check").fetchall()
            if bad:
                raise RuntimeError(f"migration {target}: {len(bad)} foreign key violations")
            conn.execute(f"PRAGMA user_version={target}")
            conn.execute("COMMIT")
        except Exception:
            conn.execute("ROLLBACK")
            raise
        finally:
            conn.execute("PRAGMA foreign_keys=ON")
        ver = target
    return ver
