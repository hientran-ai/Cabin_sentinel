"""History tables, audit log, retention and data deletion.

Every table here has a retention deadline and a way to delete it (see RETENTION and purge()). Raw camera frames are never stored:
an observation keeps only counts and seat labels. Photos are stored only when the user sends one after previewing it.
"""
from __future__ import annotations

import hashlib
import os
from typing import Any

from . import db
from .logic import now

DAY = 86400.0
RETENTION = {          # seconds
    "observations": 7 * DAY,
    "locations": 7 * DAY,
    "media": 30 * DAY,
    "audit": 365 * DAY,
    "events": 180 * DAY,
    "deliveries": 30 * DAY,
    "incidents": 365 * DAY,
    "cabin_log": 365 * DAY,
}
OBS_MIN_GAP_S = 10
LOC_MIN_GAP_S = 10
HB_MIN_GAP_S = 60
HB_CAP = 1000


# ---------------------------------------------------------------- recording

def record_observation(conn: Any, vehicle_id: str, state: dict[str, Any], source: str) -> None:
    last = conn.execute("SELECT MAX(ts) AS t FROM observations WHERE vehicle_id=?", (vehicle_id,)).fetchone()["t"]
    if last is not None and now() - last < OBS_MIN_GAP_S:
        return
    occ = [{"seat": k, "kind": v.get("kind"), "conf": v.get("conf"), "age": v.get("age")} for k, v in state["seats"].items() if v.get("occ")]
    conn.execute("INSERT INTO observations(vehicle_id,ts,source,detector,camera_ok,people,children_hint,pets,items,cabin_temp,outside_temp,engine_on,seats_json) "
                 "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (vehicle_id, now(), source, state.get("detector"), 1 if state.get("camera") == "ok" else 0,
                  sum(1 for o in occ if o["kind"] == "person"), sum(1 for o in occ if o.get("age") == "child"),
                  sum(1 for o in occ if o["kind"] == "pet"), len(state.get("items") or []),
                  state.get("cabin_temp") if state.get("temp_known", True) else None, state.get("outside_temp"),
                  1 if state.get("engine_on") else 0, db.dumps(occ)))


def record_location(conn: Any, vehicle_id: str, lat: float, lon: float, accuracy_m: float | None, heading: float | None, source: str) -> None:
    last = conn.execute("SELECT MAX(ts) AS t FROM locations WHERE vehicle_id=?", (vehicle_id,)).fetchone()["t"]
    if last is not None and now() - last < LOC_MIN_GAP_S:
        return
    conn.execute("INSERT INTO locations(vehicle_id,ts,lat,lon,accuracy_m,heading,source) VALUES(?,?,?,?,?,?,?)",
                 (vehicle_id, now(), lat, lon, accuracy_m, heading, source))


def record_heartbeat(conn: Any, device_id: str, platform: str, battery: int | None, charging: bool, thermal: str | None) -> None:
    last = conn.execute("SELECT MAX(ts) AS t FROM heartbeats WHERE device_id=?", (device_id,)).fetchone()["t"]
    if last is not None and now() - last < HB_MIN_GAP_S:
        return
    conn.execute("INSERT INTO heartbeats(device_id,ts,battery_pct,charging,thermal,platform) VALUES(?,?,?,?,?,?)",
                 (device_id, now(), battery, 1 if charging else 0, thermal, platform))
    conn.execute("DELETE FROM heartbeats WHERE device_id=? AND id NOT IN (SELECT id FROM heartbeats WHERE device_id=? ORDER BY id DESC LIMIT ?)",
                 (device_id, device_id, HB_CAP))


def audit(conn: Any, actor_id: str | None, actor_name: str | None, action: str, *, vehicle_id: str | None = None, target: str | None = None,
          outcome: str = "ok", actor_role: str | None = None, detail: dict[str, Any] | None = None) -> None:
    conn.execute("INSERT INTO audit_log(ts,actor_id,actor_name,actor_role,vehicle_id,action,target,outcome,detail_json) VALUES(?,?,?,?,?,?,?,?,?)",
                 (now(), actor_id, actor_name, actor_role, vehicle_id, action, target, outcome, db.dumps(detail or {})))


def outcome_for(status: int) -> str:
    return "ok" if status < 400 else "denied" if status in (401, 403) else "rejected" if status < 500 else "error"


# ---------------------------------------------------------------- media (photos the user chose to send)

def add_media(conn: Any, media_id: str, vehicle_id: str, ext: str, data: bytes, uploaded_by: str) -> None:
    conn.execute("INSERT INTO media(id,vehicle_id,kind,ext,sha256,size_bytes,created_at,expires_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)",
                 (media_id, vehicle_id, "photo", ext, hashlib.sha256(data).hexdigest(), len(data), now(), now() + RETENTION["media"], uploaded_by))


def adopt_legacy_media(media_dir: str, vehicle_id: str) -> None:
    """Photos saved before the media table existed get a row (and so an expiry) the first time they are listed."""
    if not os.path.isdir(media_dir):
        return
    known = {r["id"] for r in db.all_("SELECT id FROM media WHERE vehicle_id=?", vehicle_id)}
    with db.tx() as conn:
        for f in os.listdir(media_dir):
            if f.startswith(vehicle_id + "__"):
                pid, ext = f[len(vehicle_id) + 2:].rsplit(".", 1)
                if pid not in known:
                    path = os.path.join(media_dir, f)
                    with open(path, "rb") as fh:
                        data = fh.read()
                    t = os.path.getmtime(path)
                    conn.execute("INSERT INTO media(id,vehicle_id,kind,ext,sha256,size_bytes,created_at,expires_at,uploaded_by) VALUES(?,?,?,?,?,?,?,?,?)",
                                 (pid, vehicle_id, "photo", ext, hashlib.sha256(data).hexdigest(), len(data), t, t + RETENTION["media"], None))


def delete_media_file(media_dir: str, vehicle_id: str, media_id: str, ext: str) -> None:
    try:
        os.remove(os.path.join(media_dir, f"{vehicle_id}__{media_id}.{ext}"))
    except FileNotFoundError:
        pass


# ---------------------------------------------------------------- retention

def purge(media_dir: str, t: float | None = None) -> dict[str, int]:
    """Delete everything past its deadline. Returns how many rows each table lost. Safe to call at any time."""
    t = now() if t is None else t
    counts: dict[str, int] = {}
    with db.tx() as conn:
        for name, col, key in (("observations", "ts", "observations"), ("locations", "ts", "locations"), ("audit_log", "ts", "audit"),
                               ("events", "at", "events"), ("deliveries", "at", "deliveries")):
            counts[name] = conn.execute(f"DELETE FROM {name} WHERE {col}<?", (t - RETENTION[key],)).rowcount
        counts["incidents"] = conn.execute("DELETE FROM incidents WHERE status='resolved' AND resolved_at<?", (t - RETENTION["incidents"],)).rowcount
        expired = conn.execute("SELECT id, vehicle_id, ext FROM media WHERE expires_at<?", (t,)).fetchall()
        for m in expired:
            delete_media_file(media_dir, m["vehicle_id"], m["id"], m["ext"])
        counts["media"] = conn.execute("DELETE FROM media WHERE expires_at<?", (t,)).rowcount
        for name, col in (("otps", "expires_at"), ("link_challenges", "expires_at"), ("device_codes", "expires_at"), ("telegram_codes", "expires_at"), ("telegram_logins", "expires_at")):
            counts[name] = conn.execute(f"DELETE FROM {name} WHERE {col}<?", (t,)).rowcount
        counts["cabin_log"] = conn.execute("DELETE FROM cabin_log WHERE ended_at IS NOT NULL AND ended_at<?", (t - RETENTION["cabin_log"],)).rowcount
        counts["tokens"] = 0
    from . import webpush
    counts["web_push"] = webpush.purge(t)
    return counts


# ---------------------------------------------------------------- data subject rights

def export_user(user_id: str) -> dict[str, Any]:
    u = db.one("SELECT id,phone,name,created_at,settings FROM users WHERE id=?", user_id)
    return {
        "profile": {"id": u["id"], "phone": u["phone"], "name": u["name"], "created_at": u["created_at"]},
        "settings": db.loads(u["settings"]),
        "children": [dict(r) for r in db.all_("SELECT id,name,cls,seat,pickup,dropoff,days FROM children WHERE owner_id=?", user_id)],
        "contacts": [dict(r) for r in db.all_("SELECT id,name,rel,phone FROM contacts WHERE user_id=?", user_id)],
        "vehicles": [dict(r) for r in db.all_("SELECT m.vehicle_id, m.role, v.name, v.plate FROM members m JOIN vehicles v ON v.id=m.vehicle_id "
                                              "WHERE m.user_id=? AND m.status='active'", user_id)],
        "telegram_linked": db.one("SELECT 1 FROM telegram_links WHERE user_id=?", user_id) is not None,
        "cabin_log": [dict(r) for r in db.all_("SELECT l.kind,l.vehicle_id,l.started_at,l.ended_at,l.seat,l.level,l.outcome,l.basis FROM cabin_log l JOIN members m "
                                               "ON m.vehicle_id=l.vehicle_id WHERE m.user_id=? AND m.status='active' AND m.role='owner' ORDER BY l.started_at DESC LIMIT 2000", user_id)],
    }


def delete_account(user_id: str, media_dir: str) -> dict[str, int]:
    """Erase the account. Vehicles the user owns are deleted with everything on them (incidents, history, photos); other family
    members simply lose access. Audit rows stay but the name is removed."""
    removed = {"vehicles": 0}
    with db.tx() as conn:
        owned = [r["vehicle_id"] for r in conn.execute("SELECT vehicle_id FROM members WHERE user_id=? AND role='owner'", (user_id,))]
        for vid in owned:
            for m in conn.execute("SELECT id, ext FROM media WHERE vehicle_id=?", (vid,)).fetchall():
                delete_media_file(media_dir, vid, m["id"], m["ext"])
            conn.execute("DELETE FROM vehicles WHERE id=?", (vid,))
            removed["vehicles"] += 1
        conn.execute("DELETE FROM members WHERE user_id=?", (user_id,))
        conn.execute("UPDATE audit_log SET actor_name='(đã xóa)' WHERE actor_id=?", (user_id,))
        conn.execute("DELETE FROM users WHERE id=?", (user_id,))
    return removed
