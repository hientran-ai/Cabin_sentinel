"""Persistent platform data: accounts, sessions, tenants, vehicles, devices, caregivers,
commands, evidence, rule/model registries and the audit log.

Safety decisions stay in CabinService/rules.py. Nothing here decides risk or actuates
hardware: commands are only a lifecycle ledger that a device acknowledges.
"""

import hashlib
import hmac
import json
import secrets
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from functools import lru_cache
from pathlib import Path
from uuid import uuid4

from src.cabinsentinel.fleet import AccessDeniedError, Grant
from src.config import get_settings

ACCESS_TTL = timedelta(minutes=15)
REFRESH_TTL = timedelta(days=7)
INVITE_TTL = timedelta(days=7)
PAIRING_TTL = timedelta(minutes=15)
COMMAND_TTL = timedelta(minutes=2)
SAMPLE_RETENTION = timedelta(hours=24)
MAX_FAILED_LOGINS = 5
LOCKOUT = timedelta(minutes=15)

PERMISSIONS = {
    "profile.manage", "vehicle.read", "vehicle.manage", "caregiver.manage", "incident.ack", "incident.manage",
    "command.request", "fleet.read", "fleet.manage", "device.read", "device.manage", "user.manage",
    "audit.read", "audit.manage", "model.manage", "rules.manage", "system.read",
}
DEFAULT_ROLES = {
    "admin": ["*"],
    "operator": ["fleet.read", "vehicle.read", "incident.manage", "incident.ack", "command.request",
                 "device.read", "audit.read", "system.read"],
    "owner": ["profile.manage", "vehicle.read", "vehicle.manage", "caregiver.manage", "incident.ack",
              "incident.manage", "command.request"],
    "caregiver": ["profile.manage", "vehicle.read", "incident.ack"],
}
COMMAND_TYPES = {"horn", "sms", "unlock"}
COMMAND_FINAL = {"acknowledged", "failed", "expired", "canceled", "rejected"}
LIVING = {"person", "baby", "dog", "cat"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (tenant_id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS roles (role TEXT PRIMARY KEY, permissions_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY, tenant_id TEXT, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL DEFAULT '', phone TEXT, language TEXT NOT NULL DEFAULT 'vi',
  role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT, last_login_at TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (
  session_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, family_id TEXT NOT NULL,
  access_hash TEXT NOT NULL UNIQUE, refresh_hash TEXT NOT NULL UNIQUE, access_expires TEXT NOT NULL,
  refresh_expires TEXT NOT NULL, revoked_at TEXT, rotated INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS notification_settings (user_id TEXT PRIMARY KEY, settings_json TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS emergency_contacts (
  contact_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, full_name TEXT NOT NULL, phone TEXT NOT NULL,
  relationship TEXT, verified_at TEXT, code_hash TEXT, code_expires TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS caregiver_links (
  link_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, email TEXT NOT NULL, caregiver_id TEXT,
  vehicle_ids_json TEXT NOT NULL, can_acknowledge INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL,
  token_hash TEXT, expires_at TEXT, created_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS vehicles (
  vehicle_id TEXT PRIMARY KEY, tenant_id TEXT, owner_id TEXT, name TEXT NOT NULL, plate TEXT, model TEXT,
  status TEXT NOT NULL DEFAULT 'active', claim_hash TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS pairing_codes (code_hash TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT);
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, serial TEXT NOT NULL, firmware TEXT,
  target_firmware TEXT, token_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'active',
  paired_at TEXT NOT NULL, last_seen TEXT, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS heartbeats (
  id INTEGER PRIMARY KEY AUTOINCREMENT, device_id TEXT NOT NULL, ts TEXT NOT NULL, firmware TEXT,
  battery_pct REAL, rssi_dbm REAL, status TEXT);
CREATE INDEX IF NOT EXISTS hb_device ON heartbeats(device_id, id);
CREATE TABLE IF NOT EXISTS samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT, vehicle_id TEXT NOT NULL, ts TEXT NOT NULL, temperature_c REAL,
  occupant_confidence REAL, risk_level TEXT, occupancy_state TEXT);
CREATE INDEX IF NOT EXISTS samples_vehicle ON samples(vehicle_id, ts);
CREATE TABLE IF NOT EXISTS commands (
  command_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, type TEXT NOT NULL, status TEXT NOT NULL,
  incident_id TEXT, requested_by TEXT NOT NULL, requested_at TEXT NOT NULL, authorized_by TEXT,
  authorized_at TEXT, sent_at TEXT, finished_at TEXT, expires_at TEXT NOT NULL, detail TEXT,
  history_json TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS commands_vehicle ON commands(vehicle_id, requested_at);
CREATE TABLE IF NOT EXISTS evidence (
  evidence_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, incident_id TEXT, content_type TEXT NOT NULL,
  sha256 TEXT NOT NULL, size_bytes INTEGER NOT NULL, blob BLOB NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, privacy_processed INTEGER NOT NULL, uploaded_by TEXT);
CREATE TABLE IF NOT EXISTS live_sessions (
  live_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL, revoked_at TEXT);
CREATE TABLE IF NOT EXISTS incident_ops (
  incident_id TEXT PRIMARY KEY, vehicle_id TEXT NOT NULL, assignee TEXT, ops_status TEXT NOT NULL DEFAULT 'NEW',
  keep_active INTEGER NOT NULL DEFAULT 0, notes_json TEXT NOT NULL DEFAULT '[]', version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS rulesets (
  version TEXT PRIMARY KEY, params_json TEXT NOT NULL, status TEXT NOT NULL, note TEXT,
  created_by TEXT, created_at TEXT NOT NULL, activated_at TEXT);
CREATE TABLE IF NOT EXISTS models (
  model_id TEXT PRIMARY KEY, name TEXT NOT NULL, version TEXT NOT NULL, sha256 TEXT, status TEXT NOT NULL,
  rollout_pct INTEGER NOT NULL DEFAULT 0, note TEXT, created_at TEXT NOT NULL, activated_at TEXT,
  UNIQUE(name, version));
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL, actor TEXT NOT NULL, actor_role TEXT,
  tenant_id TEXT, action TEXT NOT NULL, target TEXT, correlation_id TEXT, outcome TEXT NOT NULL, detail_json TEXT);
CREATE INDEX IF NOT EXISTS audit_ts ON audit_log(ts);
"""

BUILTIN_RULESET = {
    "version": "demo-alerts-2026-09-30",
    "params": {"hot_threshold_c": 35.0, "min_confidence": 0.4},
}
# Parameters an operator may stage. They are versioned and auditable but the rule engine
# does not read them yet (applied_to_engine=false) so no API call can weaken a verdict.
RULESET_LIMITS = {"hot_threshold_c": (25.0, 60.0), "min_confidence": (0.1, 0.95)}


class ConflictError(ValueError):
    pass


class NotFoundError(LookupError):
    pass


def _digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


def hash_password(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    key = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=32)
    return f"scrypt${salt.hex()}${key.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        _, salt, key = stored.split("$")
        candidate = hash_password(password, bytes.fromhex(salt)).split("$")[2]
    except ValueError:
        return False
    return hmac.compare_digest(candidate, key)


class PlatformStore:
    def __init__(self, db_path, *, clock=None, signing_key: str | None = None):
        self.clock = clock or (lambda: datetime.now(UTC))
        self._lock = threading.RLock()
        path = str(db_path)
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        self._db = sqlite3.connect(path, check_same_thread=False)
        self._db.row_factory = sqlite3.Row
        self._signing_key = (signing_key or secrets.token_hex(32)).encode()
        self.fleet = None
        with self._lock, self._db:
            self._db.executescript(SCHEMA)
            for role, perms in DEFAULT_ROLES.items():
                self._db.execute("INSERT OR IGNORE INTO roles VALUES (?,?,?)", (role, json.dumps(perms), self._now()))
            self._db.execute(
                "INSERT OR IGNORE INTO rulesets VALUES (?,?,?,?,?,?,?)",
                (BUILTIN_RULESET["version"], json.dumps(BUILTIN_RULESET["params"]), "active",
                 "Built-in rules.py thresholds", "system", self._now(), self._now()),
            )

    # -- helpers -----------------------------------------------------------
    def _now(self) -> str:
        return self.clock().isoformat()

    def _one(self, sql: str, args=()) -> dict | None:
        with self._lock:
            row = self._db.execute(sql, args).fetchone()
        return dict(row) if row else None

    def _all(self, sql: str, args=()) -> list[dict]:
        with self._lock:
            return [dict(r) for r in self._db.execute(sql, args).fetchall()]

    def _run(self, sql: str, args=()) -> int:
        with self._lock, self._db:
            return self._db.execute(sql, args).rowcount

    def attach(self, fleet) -> None:
        """Make accounts, devices, caregivers and dynamic vehicles visible to the Fleet."""
        self.fleet = fleet
        fleet.store = self
        for row in self._all("SELECT * FROM vehicles WHERE status='active'"):
            self._sync_vehicle(row)

    def _sync_vehicle(self, row: dict) -> None:
        if self.fleet is None:
            return
        if row["status"] != "active":
            self.fleet.vehicles.pop(row["vehicle_id"], None)
            return
        self.fleet.vehicles[row["vehicle_id"]] = {
            "vehicle_id": row["vehicle_id"], "name": row["name"], "plate": row["plate"], "model": row["model"],
            "owner": row["owner_id"], "tenant_id": row["tenant_id"], "dynamic": True,
        }

    # -- audit -------------------------------------------------------------
    def audit(self, grant: Grant | None, action: str, *, target: str | None = None, outcome: str = "ok",
              correlation_id: str | None = None, detail: dict | None = None, actor: str | None = None) -> None:
        self._run(
            "INSERT INTO audit_log(ts, actor, actor_role, tenant_id, action, target, correlation_id, outcome, detail_json)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (self._now(), actor or (grant.subject if grant else "anonymous"), grant.role if grant else None,
             grant.tenant_id if grant else None, action, target, correlation_id, outcome, json.dumps(detail or {})),
        )

    def audit_query(self, *, actor=None, action=None, correlation_id=None, target=None, since=None, until=None,
                    tenant_id=None, limit=100, offset=0) -> list[dict]:
        clauses, args = [], []
        for column, value in (("actor", actor), ("action", action), ("correlation_id", correlation_id),
                              ("target", target), ("tenant_id", tenant_id)):
            if value:
                clauses.append(f"{column} = ?")
                args.append(value)
        if since:
            clauses.append("ts >= ?")
            args.append(since)
        if until:
            clauses.append("ts <= ?")
            args.append(until)
        where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
        rows = self._all(f"SELECT * FROM audit_log {where} ORDER BY id DESC LIMIT ? OFFSET ?", (*args, limit, offset))
        for row in rows:
            row["detail"] = json.loads(row.pop("detail_json") or "{}")
        return rows

    def audit_purge(self, older_than_days: int) -> int:
        cutoff = (self.clock() - timedelta(days=older_than_days)).isoformat()
        return self._run("DELETE FROM audit_log WHERE ts < ?", (cutoff,))

    # -- tenants / roles ---------------------------------------------------
    def create_tenant(self, name: str) -> dict:
        tenant = {"tenant_id": uuid4().hex[:12], "name": name.strip(), "created_at": self._now()}
        self._run("INSERT INTO tenants VALUES (?,?,?)", tuple(tenant.values()))
        return tenant

    def tenants(self) -> list[dict]:
        return self._all("SELECT * FROM tenants ORDER BY created_at")

    def roles(self) -> dict[str, list[str]]:
        return {r["role"]: json.loads(r["permissions_json"]) for r in self._all("SELECT * FROM roles")}

    def set_role_permissions(self, role: str, permissions: list[str]) -> list[str]:
        if role not in DEFAULT_ROLES:
            raise NotFoundError("Unknown role")
        unknown = set(permissions) - PERMISSIONS - {"*"}
        if unknown:
            raise ValueError(f"Unknown permissions: {sorted(unknown)}")
        if role == "admin" and "*" not in permissions:
            raise ValueError("The admin role must keep full permissions")
        self._run("UPDATE roles SET permissions_json=?, updated_at=? WHERE role=?",
                  (json.dumps(sorted(set(permissions))), self._now(), role))
        return sorted(set(permissions))

    def can(self, grant: Grant, permission: str) -> bool:
        if grant.role == "device":
            return False
        perms = self.roles().get(grant.role, [])
        return "*" in perms or permission in perms

    # -- accounts ----------------------------------------------------------
    def create_user(self, email: str, password: str, *, role: str, full_name: str = "", phone: str | None = None,
                    language: str = "vi", tenant_id: str | None = None, user_id: str | None = None) -> dict:
        """``user_id`` is only for provisioned accounts that must match a fixed fleet owner (see bootstrap_accounts)."""
        if role not in DEFAULT_ROLES:
            raise ValueError("Unsupported role")
        email = email.strip().lower()
        if self._one("SELECT 1 FROM users WHERE email=?", (email,)):
            raise ConflictError("Email already registered")
        if user_id is not None and self._one("SELECT 1 FROM users WHERE user_id=?", (user_id,)):
            raise ConflictError("User id already in use")
        user_id = user_id or uuid4().hex
        self._run(
            "INSERT INTO users(user_id, tenant_id, email, password_hash, full_name, phone, language, role, created_at)"
            " VALUES (?,?,?,?,?,?,?,?,?)",
            (user_id, tenant_id, email, hash_password(password), full_name.strip(), phone, language, role, self._now()),
        )
        return self.user(user_id)

    @staticmethod
    def public_user(row: dict) -> dict:
        return {k: row[k] for k in ("user_id", "tenant_id", "email", "full_name", "phone", "language", "role",
                                    "active", "last_login_at", "created_at")} | {"active": bool(row["active"])}

    def user(self, user_id: str) -> dict:
        row = self._one("SELECT * FROM users WHERE user_id=?", (user_id,))
        if row is None:
            raise NotFoundError("User not found")
        return self.public_user(row)

    def users(self, *, tenant_id: str | None = None) -> list[dict]:
        rows = self._all("SELECT * FROM users WHERE (? IS NULL OR tenant_id=?) ORDER BY created_at", (tenant_id, tenant_id))
        return [self.public_user(r) for r in rows]

    def update_profile(self, user_id: str, **fields) -> dict:
        allowed = {k: v for k, v in fields.items() if k in {"full_name", "email", "phone", "language"} and v is not None}
        if "email" in allowed:
            allowed["email"] = allowed["email"].strip().lower()
            clash = self._one("SELECT user_id FROM users WHERE email=? AND user_id<>?", (allowed["email"], user_id))
            if clash:
                raise ConflictError("Email already registered")
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._run(f"UPDATE users SET {sets} WHERE user_id=?", (*allowed.values(), user_id))
        return self.user(user_id)

    def set_user_access(self, user_id: str, *, role: str | None = None, active: bool | None = None) -> dict:
        self.user(user_id)
        if role is not None:
            if role not in DEFAULT_ROLES:
                raise ValueError("Unsupported role")
            self._run("UPDATE users SET role=? WHERE user_id=?", (role, user_id))
        if active is not None:
            self._run("UPDATE users SET active=? WHERE user_id=?", (int(active), user_id))
        if role is not None or active is False:
            self.revoke_user_sessions(user_id)  # permission changes take effect immediately
        return self.user(user_id)

    def active_admins(self) -> int:
        return self._one("SELECT COUNT(*) n FROM users WHERE role='admin' AND active=1")["n"]

    # -- sessions ----------------------------------------------------------
    def login(self, email: str, password: str) -> tuple[dict, dict]:
        row = self._one("SELECT * FROM users WHERE email=?", (email.strip().lower(),))
        now = self.clock()
        if row and row["locked_until"] and now < datetime.fromisoformat(row["locked_until"]):
            raise AccessDeniedError("Account temporarily locked")
        if row is None or not row["active"] or not verify_password(password, row["password_hash"]):
            if row:
                failed = row["failed_logins"] + 1
                locked = (now + LOCKOUT).isoformat() if failed >= MAX_FAILED_LOGINS else None
                self._run("UPDATE users SET failed_logins=?, locked_until=? WHERE user_id=?",
                          (0 if locked else failed, locked, row["user_id"]))
            raise AccessDeniedError("Invalid email or password")
        self._run("UPDATE users SET failed_logins=0, locked_until=NULL, last_login_at=? WHERE user_id=?",
                  (now.isoformat(), row["user_id"]))
        return self.public_user(row), self._new_session(row["user_id"], uuid4().hex)

    def _new_session(self, user_id: str, family_id: str) -> dict:
        now = self.clock()
        access, refresh = secrets.token_urlsafe(32), secrets.token_urlsafe(48)
        self._run(
            "INSERT INTO sessions VALUES (?,?,?,?,?,?,?,NULL,0,?)",
            (uuid4().hex, user_id, family_id, _digest(access), _digest(refresh),
             (now + ACCESS_TTL).isoformat(), (now + REFRESH_TTL).isoformat(), now.isoformat()),
        )
        return {"access_token": access, "refresh_token": refresh, "token_type": "bearer",
                "expires_at": (now + ACCESS_TTL).isoformat(), "refresh_expires_at": (now + REFRESH_TTL).isoformat()}

    def refresh(self, refresh_token: str) -> tuple[dict, dict]:
        row = self._one("SELECT * FROM sessions WHERE refresh_hash=?", (_digest(refresh_token),))
        now = self.clock()
        if row is None:
            raise AccessDeniedError("Invalid refresh token")
        if row["rotated"] or row["revoked_at"]:
            # Reuse of a rotated token means it leaked: kill the whole family.
            self._run("UPDATE sessions SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL", (now.isoformat(), row["family_id"]))
            raise AccessDeniedError("Refresh token reuse detected; sign in again")
        if now >= datetime.fromisoformat(row["refresh_expires"]):
            raise AccessDeniedError("Refresh token expired")
        user = self._one("SELECT * FROM users WHERE user_id=?", (row["user_id"],))
        if user is None or not user["active"]:
            raise AccessDeniedError("Account disabled")
        self._run("UPDATE sessions SET rotated=1, revoked_at=? WHERE session_id=?", (now.isoformat(), row["session_id"]))
        return self.public_user(user), self._new_session(row["user_id"], row["family_id"])

    def logout(self, *, access_token: str | None = None, refresh_token: str | None = None) -> None:
        row = None
        if access_token:
            row = self._one("SELECT family_id FROM sessions WHERE access_hash=?", (_digest(access_token),))
        if row is None and refresh_token:
            row = self._one("SELECT family_id FROM sessions WHERE refresh_hash=?", (_digest(refresh_token),))
        if row:
            self._run("UPDATE sessions SET revoked_at=? WHERE family_id=? AND revoked_at IS NULL", (self._now(), row["family_id"]))

    def revoke_user_sessions(self, user_id: str) -> int:
        return self._run("UPDATE sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL", (self._now(), user_id))

    def resolve_token(self, token: str) -> Grant | None:
        digest = _digest(token)
        session = self._one("SELECT * FROM sessions WHERE access_hash=?", (digest,))
        if session is not None:
            if session["revoked_at"]:
                return None
            user = self._one("SELECT * FROM users WHERE user_id=?", (session["user_id"],))
            if user is None or not user["active"]:
                return None
            return Grant(user["role"], user["user_id"], datetime.fromisoformat(session["access_expires"]),
                         tenant_id=user["tenant_id"], session_id=session["session_id"])
        device = self._one("SELECT * FROM devices WHERE token_hash=? AND status='active'", (digest,))
        if device is not None:
            self._run("UPDATE devices SET last_seen=? WHERE device_id=?", (self._now(), device["device_id"]))
            return Grant("device", f"device:{device['device_id']}", None, source="DEVICE", vehicle_id=device["vehicle_id"])
        return None

    # -- notification settings / emergency contacts ------------------------
    DEFAULT_NOTIFICATIONS = {
        "push": True, "sms": False, "email": True,
        "quiet_hours": {"enabled": False, "start": "22:00", "end": "07:00"},
        "critical_overrides_quiet_hours": True,
    }

    def notification_settings(self, user_id: str) -> dict:
        row = self._one("SELECT settings_json FROM notification_settings WHERE user_id=?", (user_id,))
        return json.loads(row["settings_json"]) if row else json.loads(json.dumps(self.DEFAULT_NOTIFICATIONS))

    def save_notification_settings(self, user_id: str, settings: dict) -> dict:
        self._run("INSERT OR REPLACE INTO notification_settings VALUES (?,?,?)", (user_id, json.dumps(settings), self._now()))
        return settings

    @staticmethod
    def _contact(row: dict) -> dict:
        return {"contact_id": row["contact_id"], "full_name": row["full_name"], "phone": row["phone"],
                "relationship": row["relationship"], "verified": row["verified_at"] is not None,
                "verified_at": row["verified_at"]}

    def emergency_contacts(self, user_id: str) -> list[dict]:
        return [self._contact(r) for r in self._all("SELECT * FROM emergency_contacts WHERE user_id=? ORDER BY created_at", (user_id,))]

    def add_emergency_contact(self, user_id: str, full_name: str, phone: str, relationship: str | None) -> dict:
        if len(self.emergency_contacts(user_id)) >= 5:
            raise ValueError("At most 5 emergency contacts")
        contact_id = uuid4().hex
        self._run("INSERT INTO emergency_contacts(contact_id, user_id, full_name, phone, relationship, created_at) VALUES (?,?,?,?,?,?)",
                  (contact_id, user_id, full_name.strip(), phone, relationship, self._now()))
        return self._contact(self._contact_row(user_id, contact_id))

    def _contact_row(self, user_id: str, contact_id: str) -> dict:
        row = self._one("SELECT * FROM emergency_contacts WHERE contact_id=? AND user_id=?", (contact_id, user_id))
        if row is None:
            raise NotFoundError("Emergency contact not found")
        return row

    def update_emergency_contact(self, user_id: str, contact_id: str, **fields) -> dict:
        row = self._contact_row(user_id, contact_id)
        new = {k: v for k, v in fields.items() if v is not None and k in {"full_name", "phone", "relationship"}}
        if new.get("phone") and new["phone"] != row["phone"]:
            new.update(verified_at=None, code_hash=None)  # a changed number must be verified again
        if new:
            sets = ", ".join(f"{k}=?" for k in new)
            self._run(f"UPDATE emergency_contacts SET {sets} WHERE contact_id=?", (*new.values(), contact_id))
        return self._contact(self._contact_row(user_id, contact_id))

    def delete_emergency_contact(self, user_id: str, contact_id: str) -> None:
        self._contact_row(user_id, contact_id)
        self._run("DELETE FROM emergency_contacts WHERE contact_id=?", (contact_id,))

    def request_contact_verification(self, user_id: str, contact_id: str) -> str:
        """Returns the one-time code. The caller decides whether it may be echoed (never in production)."""
        self._contact_row(user_id, contact_id)
        code = f"{secrets.randbelow(10**6):06d}"
        self._run("UPDATE emergency_contacts SET code_hash=?, code_expires=?, attempts=0 WHERE contact_id=?",
                  (_digest(code), (self.clock() + timedelta(minutes=10)).isoformat(), contact_id))
        return code

    def confirm_contact_verification(self, user_id: str, contact_id: str, code: str) -> dict:
        row = self._contact_row(user_id, contact_id)
        if not row["code_hash"] or self.clock() >= datetime.fromisoformat(row["code_expires"]) or row["attempts"] >= 5:
            raise ValueError("Request a new verification code")
        if not hmac.compare_digest(row["code_hash"], _digest(code)):
            self._run("UPDATE emergency_contacts SET attempts=attempts+1 WHERE contact_id=?", (contact_id,))
            raise ValueError("Incorrect verification code")
        self._run("UPDATE emergency_contacts SET verified_at=?, code_hash=NULL WHERE contact_id=?", (self._now(), contact_id))
        return self._contact(self._contact_row(user_id, contact_id))

    # -- caregivers --------------------------------------------------------
    @staticmethod
    def _link(row: dict) -> dict:
        return {"link_id": row["link_id"], "email": row["email"], "status": row["status"],
                "vehicle_ids": json.loads(row["vehicle_ids_json"]), "can_acknowledge": bool(row["can_acknowledge"]),
                "caregiver_id": row["caregiver_id"], "expires_at": row["expires_at"], "created_at": row["created_at"]}

    def invite_caregiver(self, owner_id: str, email: str, vehicle_ids: list[str], can_acknowledge: bool) -> tuple[dict, str]:
        token = secrets.token_urlsafe(24)
        link_id = uuid4().hex
        self._run("INSERT INTO caregiver_links VALUES (?,?,?,NULL,?,?,?,?,?,?,NULL)",
                  (link_id, owner_id, email.strip().lower(), json.dumps(sorted(set(vehicle_ids))), int(can_acknowledge),
                   "invited", _digest(token), (self.clock() + INVITE_TTL).isoformat(), self._now()))
        return self._link(self._link_row(link_id)), token

    def _link_row(self, link_id: str) -> dict:
        row = self._one("SELECT * FROM caregiver_links WHERE link_id=?", (link_id,))
        if row is None:
            raise NotFoundError("Caregiver link not found")
        return row

    def caregiver_links(self, owner_id: str) -> list[dict]:
        return [self._link(r) for r in self._all(
            "SELECT * FROM caregiver_links WHERE owner_id=? AND status<>'revoked' ORDER BY created_at", (owner_id,))]

    def owner_link(self, owner_id: str, link_id: str) -> dict:
        row = self._link_row(link_id)
        if row["owner_id"] != owner_id:
            raise NotFoundError("Caregiver link not found")
        return row

    def set_link_vehicles(self, owner_id: str, link_id: str, vehicle_ids: list[str], can_acknowledge: bool | None) -> dict:
        row = self.owner_link(owner_id, link_id)
        if row["status"] == "revoked":
            raise ConflictError("Link already revoked")
        self._run("UPDATE caregiver_links SET vehicle_ids_json=?, can_acknowledge=? WHERE link_id=?",
                  (json.dumps(sorted(set(vehicle_ids))), int(row["can_acknowledge"] if can_acknowledge is None else can_acknowledge), link_id))
        return self._link(self._link_row(link_id))

    def revoke_caregiver(self, owner_id: str, link_id: str) -> None:
        self.owner_link(owner_id, link_id)
        self._run("UPDATE caregiver_links SET status='revoked', revoked_at=?, token_hash=NULL WHERE link_id=?", (self._now(), link_id))

    def accept_invite(self, user: dict, token: str) -> dict:
        row = self._one("SELECT * FROM caregiver_links WHERE token_hash=? AND status='invited'", (_digest(token),))
        if row is None or self.clock() >= datetime.fromisoformat(row["expires_at"]):
            raise ValueError("Invite is invalid or expired")
        if row["email"] != user["email"]:
            raise AccessDeniedError("Invite was issued to a different email")
        if user["role"] != "caregiver":
            raise ValueError("Only caregiver accounts can accept invites")
        self._run("UPDATE caregiver_links SET status='active', caregiver_id=?, token_hash=NULL WHERE link_id=?",
                  (user["user_id"], row["link_id"]))
        return self._link(self._link_row(row["link_id"]))

    def caregiver_can_view(self, caregiver_id: str, vehicle_id: str) -> bool:
        return any(vehicle_id in json.loads(r["vehicle_ids_json"]) for r in self._all(
            "SELECT vehicle_ids_json FROM caregiver_links WHERE caregiver_id=? AND status='active'", (caregiver_id,)))

    def caregiver_can_acknowledge(self, caregiver_id: str, vehicle_id: str) -> bool:
        return any(r["can_acknowledge"] and vehicle_id in json.loads(r["vehicle_ids_json"]) for r in self._all(
            "SELECT * FROM caregiver_links WHERE caregiver_id=? AND status='active'", (caregiver_id,)))

    def caregiver_vehicles(self, caregiver_id: str) -> list[str]:
        ids: set[str] = set()
        for r in self._all("SELECT vehicle_ids_json FROM caregiver_links WHERE caregiver_id=? AND status='active'", (caregiver_id,)):
            ids.update(json.loads(r["vehicle_ids_json"]))
        return sorted(ids)

    # -- vehicles / pairing / devices --------------------------------------
    def create_vehicle(self, *, vehicle_id: str | None, name: str, plate: str | None, model: str | None,
                       owner_id: str | None, tenant_id: str | None) -> tuple[dict, str | None]:
        vehicle_id = vehicle_id or f"V-{uuid4().hex[:10].upper()}"
        if vehicle_id.startswith("DEMO_") or (self.fleet and vehicle_id in self.fleet.vehicles) \
                or self._one("SELECT 1 FROM vehicles WHERE vehicle_id=?", (vehicle_id,)):
            raise ConflictError("Vehicle id already exists or is reserved")
        claim = None
        claim_hash = None
        if owner_id is None:  # inventory vehicle waiting for an owner to claim it
            claim = secrets.token_urlsafe(9)
            claim_hash = _digest(claim)
        now = self._now()
        self._run("INSERT INTO vehicles VALUES (?,?,?,?,?,?,'active',?,?,?)",
                  (vehicle_id, tenant_id, owner_id, name.strip(), plate, model, claim_hash, now, now))
        row = self._vehicle_row(vehicle_id)
        self._sync_vehicle(row)
        return self.vehicle(vehicle_id), claim

    def _vehicle_row(self, vehicle_id: str) -> dict:
        row = self._one("SELECT * FROM vehicles WHERE vehicle_id=?", (vehicle_id,))
        if row is None:
            raise NotFoundError("Vehicle not found")
        return row

    def vehicle(self, vehicle_id: str) -> dict:
        row = self._vehicle_row(vehicle_id)
        return {k: row[k] for k in ("vehicle_id", "tenant_id", "owner_id", "name", "plate", "model", "status", "created_at", "updated_at")} \
            | {"claimed": row["owner_id"] is not None}

    def is_dynamic_vehicle(self, vehicle_id: str) -> bool:
        return self._one("SELECT 1 FROM vehicles WHERE vehicle_id=?", (vehicle_id,)) is not None

    def update_vehicle(self, vehicle_id: str, **fields) -> dict:
        row = self._vehicle_row(vehicle_id)
        if row["status"] != "active" and fields.get("status") != "active":
            raise ConflictError("Vehicle is retired")
        allowed = {k: v for k, v in fields.items() if k in {"name", "plate", "model", "owner_id", "tenant_id", "status"} and v is not None}
        if allowed:
            sets = ", ".join(f"{k}=?" for k in allowed)
            self._run(f"UPDATE vehicles SET {sets}, updated_at=? WHERE vehicle_id=?", (*allowed.values(), self._now(), vehicle_id))
        self._sync_vehicle(self._vehicle_row(vehicle_id))
        return self.vehicle(vehicle_id)

    def retire_vehicle(self, vehicle_id: str) -> dict:
        """Soft delete: history and audit stay, devices lose access."""
        self._vehicle_row(vehicle_id)
        self._run("UPDATE devices SET status='revoked', revoked_at=? WHERE vehicle_id=? AND status='active'", (self._now(), vehicle_id))
        return self.update_vehicle(vehicle_id, status="retired")

    def claim_vehicle(self, vehicle_id: str, claim_code: str, owner_id: str, tenant_id: str | None) -> dict:
        row = self._one("SELECT * FROM vehicles WHERE vehicle_id=? AND owner_id IS NULL AND status='active'", (vehicle_id,))
        if row is None or not hmac.compare_digest(row["claim_hash"] or "", _digest(claim_code)):
            raise ValueError("Vehicle id or claim code is invalid")
        self._run("UPDATE vehicles SET owner_id=?, tenant_id=COALESCE(tenant_id, ?), claim_hash=NULL, updated_at=? WHERE vehicle_id=?",
                  (owner_id, tenant_id, self._now(), vehicle_id))
        self._sync_vehicle(self._vehicle_row(vehicle_id))
        return self.vehicle(vehicle_id)

    def search_vehicles(self, *, q: str | None, tenant_id: str | None, status: str | None, owner_id: str | None,
                        page: int, page_size: int, scope_tenant: str | None = None) -> dict:
        """Admin fleet listing over static demo and dynamic vehicles (the Fleet registry is the source)."""
        rows = []
        for vid, v in (self.fleet.vehicles if self.fleet else {}).items():
            db = self._one("SELECT status FROM vehicles WHERE vehicle_id=?", (vid,))
            rows.append({"vehicle_id": vid, "name": v["name"], "plate": v.get("plate"), "model": v.get("model"),
                         "owner_id": v.get("owner"), "tenant_id": v.get("tenant_id"), "status": "active", "dynamic": bool(db)})
        for r in self._all("SELECT * FROM vehicles WHERE status<>'active'"):
            rows.append({"vehicle_id": r["vehicle_id"], "name": r["name"], "plate": r["plate"], "model": r["model"],
                         "owner_id": r["owner_id"], "tenant_id": r["tenant_id"], "status": r["status"], "dynamic": True})
        tenant_filter = scope_tenant or tenant_id
        needle = q.lower() if q else None
        rows = [r for r in rows
                if (not tenant_filter or r["tenant_id"] == tenant_filter)
                and (not status or r["status"] == status) and (not owner_id or r["owner_id"] == owner_id)
                and (not needle or needle in f"{r['vehicle_id']} {r['name']} {r['plate'] or ''} {r['model'] or ''}".lower())]
        rows.sort(key=lambda r: r["vehicle_id"])
        start = (page - 1) * page_size
        return {"total": len(rows), "page": page, "page_size": page_size, "items": rows[start:start + page_size]}

    def issue_pairing_code(self, vehicle_id: str) -> dict:
        self._vehicle_row(vehicle_id)
        code = secrets.token_hex(4).upper()
        expires = self.clock() + PAIRING_TTL
        self._run("INSERT INTO pairing_codes VALUES (?,?,?,NULL)", (_digest(code), vehicle_id, expires.isoformat()))
        return {"vehicle_id": vehicle_id, "pairing_code": code, "expires_at": expires.isoformat()}

    def pair_device(self, code: str, serial: str, firmware: str | None) -> dict:
        digest = _digest(code.strip().upper())
        token, device_id = secrets.token_urlsafe(32), uuid4().hex
        # Check, consume and issue under one lock + transaction so a code can be used exactly once.
        with self._lock, self._db:
            row = self._db.execute("SELECT * FROM pairing_codes WHERE code_hash=? AND used_at IS NULL", (digest,)).fetchone()
            now = self._now()
            if row is None or self.clock() >= datetime.fromisoformat(row["expires_at"]):
                raise ValueError("Pairing code is invalid or expired")
            if not self._db.execute("SELECT 1 FROM vehicles WHERE vehicle_id=? AND status='active'", (row["vehicle_id"],)).fetchone():
                raise ValueError("Pairing code is invalid or expired")
            used = self._db.execute("UPDATE pairing_codes SET used_at=? WHERE code_hash=? AND used_at IS NULL", (now, digest)).rowcount
            if used != 1:
                raise ValueError("Pairing code is invalid or expired")
            self._db.execute("UPDATE devices SET status='revoked', revoked_at=? WHERE vehicle_id=? AND status='active'", (now, row["vehicle_id"]))
            self._db.execute("INSERT INTO devices VALUES (?,?,?,?,NULL,?,'active',?,NULL,NULL)",
                             (device_id, row["vehicle_id"], serial, firmware, _digest(token), now))
        return {"device_id": device_id, "vehicle_id": row["vehicle_id"], "device_token": token}

    @staticmethod
    def _device(row: dict, now: datetime, online_s: int = 90) -> dict:
        seen = datetime.fromisoformat(row["last_seen"]) if row["last_seen"] else None
        return {"device_id": row["device_id"], "vehicle_id": row["vehicle_id"], "serial": row["serial"],
                "firmware": row["firmware"], "target_firmware": row["target_firmware"], "status": row["status"],
                "paired_at": row["paired_at"], "last_seen": row["last_seen"], "revoked_at": row["revoked_at"],
                "online": bool(seen and row["status"] == "active" and (now - seen).total_seconds() <= online_s),
                "update_pending": bool(row["target_firmware"] and row["target_firmware"] != row["firmware"])}

    def devices(self, *, vehicle_ids: list[str] | None = None) -> list[dict]:
        now = self.clock()
        rows = self._all("SELECT * FROM devices ORDER BY paired_at DESC")
        return [self._device(r, now) for r in rows if vehicle_ids is None or r["vehicle_id"] in vehicle_ids]

    def device(self, device_id: str) -> dict:
        row = self._one("SELECT * FROM devices WHERE device_id=?", (device_id,))
        if row is None:
            raise NotFoundError("Device not found")
        return self._device(row, self.clock())

    def revoke_device(self, device_id: str) -> dict:
        self.device(device_id)
        self._run("UPDATE devices SET status='revoked', revoked_at=? WHERE device_id=?", (self._now(), device_id))
        return self.device(device_id)

    def set_target_firmware(self, device_id: str, firmware: str | None) -> dict:
        self.device(device_id)
        self._run("UPDATE devices SET target_firmware=? WHERE device_id=?", (firmware, device_id))
        return self.device(device_id)

    def heartbeat(self, device_id: str, *, firmware: str | None, battery_pct: float | None, rssi_dbm: float | None, status: str | None) -> dict:
        now = self._now()
        self._run("INSERT INTO heartbeats(device_id, ts, firmware, battery_pct, rssi_dbm, status) VALUES (?,?,?,?,?,?)",
                  (device_id, now, firmware, battery_pct, rssi_dbm, status))
        if firmware:
            self._run("UPDATE devices SET firmware=?, last_seen=? WHERE device_id=?", (firmware, now, device_id))
        else:
            self._run("UPDATE devices SET last_seen=? WHERE device_id=?", (now, device_id))
        self._run("DELETE FROM heartbeats WHERE device_id=? AND id NOT IN "
                  "(SELECT id FROM heartbeats WHERE device_id=? ORDER BY id DESC LIMIT 1000)", (device_id, device_id))
        return {"device_id": device_id, "server_time": now, "target_firmware": self.device(device_id)["target_firmware"]}

    def heartbeats(self, device_id: str, limit: int) -> list[dict]:
        self.device(device_id)
        return self._all("SELECT ts, firmware, battery_pct, rssi_dbm, status FROM heartbeats WHERE device_id=? ORDER BY id DESC LIMIT ?",
                         (device_id, limit))

    # -- telemetry ---------------------------------------------------------
    def record_sample(self, vehicle_id: str, state: dict | None) -> None:
        if not state:
            return
        living = [o["confidence"] for o in state.get("detected_objects") or [] if o["class_name"].strip().lower().replace("_", " ") in LIVING]
        now = self.clock()
        self._run("INSERT INTO samples(vehicle_id, ts, temperature_c, occupant_confidence, risk_level, occupancy_state) VALUES (?,?,?,?,?,?)",
                  (vehicle_id, now.isoformat(), state.get("temperature"), max(living) if living else 0.0,
                   state.get("risk_level"), state.get("occupancy_state")))
        self._run("DELETE FROM samples WHERE vehicle_id=? AND ts<?", (vehicle_id, (now - SAMPLE_RETENTION).isoformat()))

    def telemetry(self, vehicle_id: str, minutes: int, bucket_s: int) -> dict:
        now = self.clock()
        since = now - timedelta(minutes=minutes)
        rows = self._all("SELECT * FROM samples WHERE vehicle_id=? AND ts>=? ORDER BY ts", (vehicle_id, since.isoformat()))
        buckets: dict[int, list[dict]] = {}
        for r in rows:
            buckets.setdefault(int((datetime.fromisoformat(r["ts"]) - since).total_seconds() // bucket_s), []).append(r)
        points = []
        for index in sorted(buckets):
            group = buckets[index]
            temps = [g["temperature_c"] for g in group if g["temperature_c"] is not None]
            points.append({
                "ts": (since + timedelta(seconds=index * bucket_s)).isoformat(),
                "temperature_c": round(sum(temps) / len(temps), 2) if temps else None,
                "occupant_confidence": max(g["occupant_confidence"] or 0.0 for g in group),
                "risk_level": group[-1]["risk_level"], "samples": len(group),
            })
        return {"vehicle_id": vehicle_id, "from": since.isoformat(), "to": now.isoformat(), "bucket_seconds": bucket_s, "points": points}

    # -- commands ----------------------------------------------------------
    @staticmethod
    def _command(row: dict) -> dict:
        return {**{k: row[k] for k in ("command_id", "vehicle_id", "type", "status", "incident_id", "requested_by", "requested_at",
                                         "authorized_by", "authorized_at", "sent_at", "finished_at", "expires_at", "detail")},
                "history": json.loads(row["history_json"])}

    def _command_row(self, command_id: str) -> dict:
        row = self._one("SELECT * FROM commands WHERE command_id=?", (command_id,))
        if row is None:
            raise NotFoundError("Command not found")
        return row

    def _expire_commands(self) -> None:
        now = self.clock()
        for row in self._all("SELECT * FROM commands WHERE status IN ('requested','authorized','sent') AND expires_at<=?", (now.isoformat(),)):
            self._transition(row, "expired", None, "Command expired before completion")

    def _transition(self, row: dict, status: str, actor: str | None, detail: str | None = None, **extra) -> dict:
        now = self._now()
        history = json.loads(row["history_json"]) + [{"status": status, "at": now, "by": actor, "detail": detail}]
        columns = {"status": status, "history_json": json.dumps(history), **extra}
        if detail is not None:
            columns["detail"] = detail
        if status in COMMAND_FINAL:
            columns["finished_at"] = now
        sets = ", ".join(f"{k}=?" for k in columns)
        self._run(f"UPDATE commands SET {sets} WHERE command_id=?", (*columns.values(), row["command_id"]))
        return self._command_row(row["command_id"])

    def request_command(self, vehicle_id: str, command_type: str, actor: str, incident_id: str | None) -> dict:
        if command_type not in COMMAND_TYPES:
            raise ValueError("Unsupported command type")
        self._expire_commands()
        open_same = self._one("SELECT 1 FROM commands WHERE vehicle_id=? AND type=? AND status IN ('requested','authorized','sent')",
                              (vehicle_id, command_type))
        if open_same:
            raise ConflictError("An identical command is already in progress")
        now = self.clock()
        command_id = uuid4().hex
        history = [{"status": "requested", "at": now.isoformat(), "by": actor, "detail": None}]
        self._run("INSERT INTO commands VALUES (?,?,?,?,?,?,?,NULL,NULL,NULL,NULL,?,NULL,?)",
                  (command_id, vehicle_id, command_type, "requested", incident_id, actor, now.isoformat(),
                   (now + COMMAND_TTL).isoformat(), json.dumps(history)))
        return self._command(self._command_row(command_id))

    def get_command(self, command_id: str) -> dict:
        self._expire_commands()
        return self._command(self._command_row(command_id))

    def commands(self, vehicle_ids: list[str] | None, limit: int, status: str | None = None) -> list[dict]:
        self._expire_commands()
        rows = self._all("SELECT * FROM commands WHERE (? IS NULL OR status=?) ORDER BY requested_at DESC", (status, status))
        return [self._command(r) for r in rows if vehicle_ids is None or r["vehicle_id"] in vehicle_ids][:limit]

    def authorize_command(self, command_id: str, actor: str, *, four_eyes: bool) -> dict:
        self._expire_commands()
        row = self._command_row(command_id)
        if row["status"] != "requested":
            raise ConflictError(f"Command is {row['status']}")
        if four_eyes and row["requested_by"] == actor:
            raise AccessDeniedError("A different person must authorize this command")
        return self._command(self._transition(row, "authorized", actor, authorized_by=actor, authorized_at=self._now()))

    def cancel_command(self, command_id: str, actor: str) -> dict:
        self._expire_commands()
        row = self._command_row(command_id)
        if row["status"] not in {"requested", "authorized"}:
            raise ConflictError(f"Command is {row['status']}")
        return self._command(self._transition(row, "canceled", actor))

    def reject_command(self, command_id: str, actor: str, reason: str | None) -> dict:
        row = self._command_row(command_id)
        if row["status"] != "requested":
            raise ConflictError(f"Command is {row['status']}")
        return self._command(self._transition(row, "rejected", actor, reason))

    def pull_device_commands(self, vehicle_id: str) -> list[dict]:
        """Hand authorized commands to the device exactly once (authorized -> sent)."""
        self._expire_commands()
        out = []
        for row in self._all("SELECT * FROM commands WHERE vehicle_id=? AND status='authorized' ORDER BY requested_at", (vehicle_id,)):
            out.append(self._command(self._transition(row, "sent", "device", sent_at=self._now())))
        return out

    def ack_command(self, command_id: str, vehicle_id: str, ok: bool, detail: str | None) -> dict:
        self._expire_commands()
        row = self._command_row(command_id)
        if row["vehicle_id"] != vehicle_id:
            raise NotFoundError("Command not found")
        if row["status"] in COMMAND_FINAL:
            if row["status"] == ("acknowledged" if ok else "failed"):
                return self._command(row)  # idempotent device retry
            raise ConflictError(f"Command is already {row['status']}")
        if row["status"] != "sent":
            raise ConflictError("Command was not sent to the device")
        return self._command(self._transition(row, "acknowledged" if ok else "failed", "device", detail))

    # -- evidence / live ---------------------------------------------------
    def save_evidence(self, vehicle_id: str, incident_id: str | None, content_type: str, data: bytes,
                      uploaded_by: str, retention: timedelta) -> dict:
        evidence_id, now = uuid4().hex, self.clock()
        self._run("INSERT INTO evidence VALUES (?,?,?,?,?,?,?,?,?,1,?)",
                  (evidence_id, vehicle_id, incident_id, content_type, hashlib.sha256(data).hexdigest(), len(data), data,
                   now.isoformat(), (now + retention).isoformat(), uploaded_by))
        return self.evidence_meta(evidence_id)

    def purge_evidence(self) -> int:
        return self._run("DELETE FROM evidence WHERE expires_at<=?", (self._now(),))

    def evidence_meta(self, evidence_id: str) -> dict:
        self.purge_evidence()
        row = self._one("SELECT evidence_id, vehicle_id, incident_id, content_type, sha256, size_bytes, created_at, expires_at, "
                        "privacy_processed FROM evidence WHERE evidence_id=?", (evidence_id,))
        if row is None:
            raise NotFoundError("Evidence not found or expired")
        return {**row, "privacy_processed": bool(row["privacy_processed"])}

    def evidence_list(self, vehicle_id: str, incident_id: str | None) -> list[dict]:
        self.purge_evidence()
        rows = self._all("SELECT evidence_id FROM evidence WHERE vehicle_id=? AND (? IS NULL OR incident_id=?) ORDER BY created_at DESC",
                         (vehicle_id, incident_id, incident_id))
        return [self.evidence_meta(r["evidence_id"]) for r in rows]

    def evidence_blob(self, evidence_id: str) -> tuple[dict, bytes]:
        meta = self.evidence_meta(evidence_id)
        return meta, self._one("SELECT blob FROM evidence WHERE evidence_id=?", (evidence_id,))["blob"]

    def sign(self, evidence_id: str, ttl_s: int) -> dict:
        exp = int(self.clock().timestamp()) + ttl_s
        return {"expires": exp, "signature": hmac.new(self._signing_key, f"{evidence_id}.{exp}".encode(), "sha256").hexdigest()}

    def verify_signature(self, evidence_id: str, expires: int, signature: str) -> bool:
        good = hmac.new(self._signing_key, f"{evidence_id}.{expires}".encode(), "sha256").hexdigest()
        return hmac.compare_digest(good, signature) and self.clock().timestamp() < expires

    def create_live_session(self, vehicle_id: str, user_id: str, ttl: timedelta) -> dict:
        live_id, now = secrets.token_urlsafe(16), self.clock()
        self._run("INSERT INTO live_sessions VALUES (?,?,?,?,?,NULL)", (live_id, vehicle_id, user_id, now.isoformat(), (now + ttl).isoformat()))
        return {"live_session_id": live_id, "vehicle_id": vehicle_id, "expires_at": (now + ttl).isoformat()}

    def live_session(self, live_id: str) -> dict:
        row = self._one("SELECT * FROM live_sessions WHERE live_id=?", (live_id,))
        if row is None or row["revoked_at"] or self.clock() >= datetime.fromisoformat(row["expires_at"]):
            raise NotFoundError("Live session not found or expired")
        return row

    def end_live_session(self, live_id: str) -> None:
        self._run("UPDATE live_sessions SET revoked_at=? WHERE live_id=?", (self._now(), live_id))

    # -- incident operations ----------------------------------------------
    @staticmethod
    def _ops(row: dict | None, incident_id: str, vehicle_id: str) -> dict:
        if row is None:
            return {"incident_id": incident_id, "vehicle_id": vehicle_id, "assignee": None, "ops_status": "NEW",
                    "keep_active": False, "notes": [], "version": 0, "updated_at": None}
        return {"incident_id": row["incident_id"], "vehicle_id": row["vehicle_id"], "assignee": row["assignee"],
                "ops_status": row["ops_status"], "keep_active": bool(row["keep_active"]),
                "notes": json.loads(row["notes_json"]), "version": row["version"], "updated_at": row["updated_at"]}

    def incident_ops(self, incident_id: str, vehicle_id: str) -> dict:
        return self._ops(self._one("SELECT * FROM incident_ops WHERE incident_id=?", (incident_id,)), incident_id, vehicle_id)

    def update_incident_ops(self, incident_id: str, vehicle_id: str, expected_version: int, *, actor: str,
                            assignee: str | None = None, ops_status: str | None = None, keep_active: bool | None = None,
                            note: str | None = None) -> dict:
        with self._lock, self._db:
            current = self.incident_ops(incident_id, vehicle_id)
            if current["version"] != expected_version:
                raise ConflictError(f"Incident changed (current version {current['version']})")
            notes = current["notes"] + ([{"at": self._now(), "by": actor, "text": note}] if note else [])
            new = {"assignee": assignee if assignee is not None else current["assignee"],
                   "ops_status": ops_status or ("ASSIGNED" if assignee else current["ops_status"]),
                   "keep_active": int(current["keep_active"] if keep_active is None else keep_active)}
            self._db.execute("INSERT OR REPLACE INTO incident_ops VALUES (?,?,?,?,?,?,?,?)",
                             (incident_id, vehicle_id, new["assignee"], new["ops_status"], new["keep_active"],
                              json.dumps(notes[-50:]), current["version"] + 1, self._now()))
        return self.incident_ops(incident_id, vehicle_id)

    # -- rulesets / models -------------------------------------------------
    def rulesets(self) -> list[dict]:
        rows = self._all("SELECT * FROM rulesets ORDER BY created_at DESC, version DESC")
        return [{**{k: r[k] for k in ("version", "status", "note", "created_by", "created_at", "activated_at")},
                 "params": json.loads(r["params_json"]),
                 "applied_to_engine": r["version"] == BUILTIN_RULESET["version"] and r["status"] == "active"} for r in rows]

    def create_ruleset(self, version: str, params: dict, note: str | None, actor: str) -> dict:
        unknown = set(params) - set(RULESET_LIMITS)
        if unknown:
            raise ValueError(f"Unsupported parameters: {sorted(unknown)}")
        for key, value in params.items():
            low, high = RULESET_LIMITS[key]
            if not isinstance(value, (int, float)) or isinstance(value, bool) or not low <= value <= high:
                raise ValueError(f"{key} must be between {low} and {high}")
        if self._one("SELECT 1 FROM rulesets WHERE version=?", (version,)):
            raise ConflictError("Ruleset version already exists")
        merged = {**BUILTIN_RULESET["params"], **params}
        self._run("INSERT INTO rulesets VALUES (?,?,?,?,?,?,NULL)", (version, json.dumps(merged), "draft", note, actor, self._now()))
        return next(r for r in self.rulesets() if r["version"] == version)

    def activate_ruleset(self, version: str) -> dict:
        row = self._one("SELECT * FROM rulesets WHERE version=?", (version,))
        if row is None:
            raise NotFoundError("Ruleset not found")
        with self._lock, self._db:
            self._db.execute("UPDATE rulesets SET status='retired' WHERE status='active'")
            self._db.execute("UPDATE rulesets SET status='active', activated_at=? WHERE version=?", (self._now(), version))
        return next(r for r in self.rulesets() if r["version"] == version)

    def models(self) -> list[dict]:
        return self._all("SELECT * FROM models ORDER BY created_at DESC")

    def register_model(self, name: str, version: str, sha256: str | None, note: str | None) -> dict:
        if self._one("SELECT 1 FROM models WHERE name=? AND version=?", (name, version)):
            raise ConflictError("Model version already registered")
        model_id = uuid4().hex
        self._run("INSERT INTO models VALUES (?,?,?,?,?,0,?,?,NULL)", (model_id, name, version, sha256, "registered", note, self._now()))
        return self._one("SELECT * FROM models WHERE model_id=?", (model_id,))

    def rollout_model(self, model_id: str, rollout_pct: int) -> dict:
        row = self._one("SELECT * FROM models WHERE model_id=?", (model_id,))
        if row is None:
            raise NotFoundError("Model not found")
        if row["status"] == "retired":
            raise ConflictError("Retired model cannot be rolled out")
        status = "active" if rollout_pct == 100 else "staged" if rollout_pct > 0 else "registered"
        with self._lock, self._db:
            if status == "active":
                self._db.execute("UPDATE models SET status='retired', rollout_pct=0 WHERE name=? AND status='active' AND model_id<>?",
                                 (row["name"], model_id))
            self._db.execute("UPDATE models SET status=?, rollout_pct=?, activated_at=? WHERE model_id=?",
                             (status, rollout_pct, self._now() if rollout_pct else None, model_id))
        return self._one("SELECT * FROM models WHERE model_id=?", (model_id,))

    def rollback_model(self, model_id: str) -> dict:
        row = self._one("SELECT * FROM models WHERE model_id=?", (model_id,))
        if row is None:
            raise NotFoundError("Model not found")
        previous = self._one("SELECT * FROM models WHERE name=? AND model_id<>? AND activated_at IS NOT NULL ORDER BY activated_at DESC LIMIT 1",
                             (row["name"], model_id))
        if previous is None:
            raise ConflictError("No earlier version to roll back to")
        with self._lock, self._db:
            self._db.execute("UPDATE models SET status='retired', rollout_pct=0 WHERE model_id=?", (model_id,))
            self._db.execute("UPDATE models SET status='active', rollout_pct=100, activated_at=? WHERE model_id=?", (self._now(), previous["model_id"]))
        return self._one("SELECT * FROM models WHERE model_id=?", (previous["model_id"],))


@lru_cache
def get_store() -> PlatformStore:
    settings = get_settings()
    db = Path(settings.cabinsentinel_db_path)
    return PlatformStore(db.with_name("platform.db"), signing_key=settings.platform_signing_key or None)
