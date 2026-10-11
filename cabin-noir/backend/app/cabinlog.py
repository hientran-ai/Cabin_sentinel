"""Cabin log: a durable record of left-behind episodes, camera-blocked stretches and device-offline stretches.

One row per episode with start, end and duration, so a family, a school or a business can see when and for how long something
happened. Rows are hash-chained per vehicle (each closed row carries the hash of the one before), so a later edit is detectable.

What is stored: kind, seat label, level, times, outcome, and counts. Never an image. Retention is in history.RETENTION["cabin_log"];
deleting a vehicle deletes its log. `basis` says where a row came from: "measured" (a real phone or in-car device), "simulated"
(the demo simulator) or "unknown" (older incidents imported before the log existed).
"""
from __future__ import annotations

import csv
import hashlib
import io
import json
import statistics
from typing import Any

from . import db, logic
from .logic import SEAT_LABEL, now

CAMERA_MIN_S = 15          # shorter blocks are noise (a hand passing in front) and are dropped
OFFLINE_MIN_S = 60
KINDS = ("left_behind", "camera_blocked", "device_offline", "replay")
KIND_LABEL = {"left_behind": "Bỏ quên người/vật trong xe", "camera_blocked": "Camera bị che", "device_offline": "Thiết bị mất kết nối", "replay": "Video thử nghiệm"}
OUTCOME_LABEL = {"confirmed": "Đã kiểm tra xe", "manual_close": "Đóng thủ công", "cleared": "Tự hết",
                 "detected": "Phát hiện, đủ ngưỡng báo", "below_threshold": "Có tín hiệu nhưng dưới ngưỡng báo, hệ thống không báo",
                 "none": "Không phát hiện gì (không có nghĩa là xe trống)", None: ""}
REPORT_CONF = 0.5          # the in-car device reports a detection only from this confidence (same bar as ingest_telemetry)
BACKFILL_LIMIT = 200


def _basis(state: dict[str, Any]) -> str:
    return "measured" if state.get("source") in logic.REAL_SOURCES else "simulated"


def _digest(row: Any, prev: str | None) -> str:
    body = [row["id"], row["vehicle_id"], row["kind"], round(row["started_at"], 3), round(row["ended_at"], 3), row["seat"], row["level"],
            row["incident_id"], row["outcome"], row["basis"], prev or ""]
    return hashlib.sha256(json.dumps(body, ensure_ascii=False, separators=(",", ":")).encode()).hexdigest()


def _last_hash(conn: Any, vehicle_id: str) -> str | None:
    r = conn.execute("SELECT hash FROM cabin_log WHERE vehicle_id=? AND hash IS NOT NULL ORDER BY ended_at DESC, rowid DESC LIMIT 1", (vehicle_id,)).fetchone()
    return r["hash"] if r else None


def _close(conn: Any, row: Any, ended_at: float, outcome: str | None, detail: dict[str, Any] | None = None) -> None:
    dur = ended_at - row["started_at"]
    floor = {"camera_blocked": CAMERA_MIN_S, "device_offline": OFFLINE_MIN_S}.get(row["kind"], 0)
    if dur < floor:
        conn.execute("DELETE FROM cabin_log WHERE id=?", (row["id"],))
        return
    merged = {**db.loads(row["detail"]), **(detail or {})}
    conn.execute("UPDATE cabin_log SET ended_at=?, outcome=?, detail=? WHERE id=?", (ended_at, outcome, db.dumps(merged), row["id"]))
    full = conn.execute("SELECT * FROM cabin_log WHERE id=?", (row["id"],)).fetchone()
    prev = _last_hash(conn, row["vehicle_id"])
    conn.execute("UPDATE cabin_log SET prev_hash=?, hash=? WHERE id=?", (prev, _digest(full, prev), row["id"]))


def _open(conn: Any, vehicle_id: str, kind: str, started_at: float, basis: str, **cols: Any) -> None:
    conn.execute("INSERT INTO cabin_log(id,vehicle_id,kind,started_at,seat,level,incident_id,basis,detail) VALUES(?,?,?,?,?,?,?,?,?)",
                 (logic.new_id("log"), vehicle_id, kind, started_at, cols.get("seat"), cols.get("level"), cols.get("incident_id"), basis, db.dumps(cols.get("detail") or {})))


def _open_row(conn: Any, vehicle_id: str, kind: str) -> Any:
    return conn.execute("SELECT * FROM cabin_log WHERE vehicle_id=? AND kind=? AND ended_at IS NULL ORDER BY started_at DESC LIMIT 1", (vehicle_id, kind)).fetchone()


def _incident_outcome(inc: Any) -> str:
    return "manual_close" if "đóng thủ công" in (inc["resolved_by"] or "") else "confirmed"


def _notify_delay(conn: Any, inc: Any) -> float | None:
    r = conn.execute("SELECT MIN(at) AS t FROM deliveries WHERE incident_id=? AND kind='level' AND status='ok'", (inc["id"],)).fetchone()
    return round(r["t"] - inc["created_at"], 1) if r and r["t"] else None


def track(conn: Any, vehicle_id: str, state: dict[str, Any]) -> None:
    """Reconcile the log with the incident table and the live state. Called inside the refresh transaction; idempotent."""
    basis = _basis(state)
    stale = logic.is_stale(state)

    # 1. left-behind episodes are the incidents
    have = {r["incident_id"]: r for r in conn.execute("SELECT * FROM cabin_log WHERE vehicle_id=? AND kind='left_behind'", (vehicle_id,))}
    incs = conn.execute("SELECT * FROM incidents WHERE vehicle_id=? ORDER BY created_at LIMIT ?", (vehicle_id, BACKFILL_LIMIT * 5)).fetchall()
    imported = 0
    for inc in incs:
        row = have.get(inc["id"])
        extra = {"ack_s": round(inc["viewed_at"] - inc["created_at"], 1)} if inc["viewed_at"] else {}
        nd = _notify_delay(conn, inc)
        if nd is not None:
            extra["notify_s"] = nd
        if row is None:
            if imported >= BACKFILL_LIMIT:
                continue
            imported += 1
            old = inc["status"] != "open" and now() - inc["created_at"] > 3600
            _open(conn, vehicle_id, "left_behind", inc["created_at"], "unknown" if old else basis, seat=inc["seat"], level=inc["level"], incident_id=inc["id"], detail=extra)
            row = conn.execute("SELECT * FROM cabin_log WHERE incident_id=? AND kind='left_behind'", (inc["id"],)).fetchone()
        if row["ended_at"] is None:
            if inc["status"] == "open":
                if row["level"] != inc["level"] or any(db.loads(row["detail"]).get(k) != v for k, v in extra.items()):
                    conn.execute("UPDATE cabin_log SET level=?, detail=? WHERE id=?", (inc["level"], db.dumps({**db.loads(row["detail"]), **extra}), row["id"]))
            else:
                if inc["level"] != row["level"]:
                    conn.execute("UPDATE cabin_log SET level=? WHERE id=?", (inc["level"], row["id"]))
                    row = conn.execute("SELECT * FROM cabin_log WHERE id=?", (row["id"],)).fetchone()
                _close(conn, row, inc["resolved_at"] or now(), _incident_outcome(inc), extra)

    # 2. camera blocked: only while parked and the data is current, otherwise "blocked" has no meaning
    blocked = (not stale) and state.get("camera") != "ok" and not state.get("engine_on")
    row = _open_row(conn, vehicle_id, "camera_blocked")
    if blocked and row is None:
        _open(conn, vehicle_id, "camera_blocked", now(), basis)
    elif not blocked and row is not None:
        _close(conn, row, state["last_seen"] if stale and state.get("last_seen") else now(), None)

    # 3. device offline: only for vehicles that have really reported before (a vehicle with no device is not "offline")
    real = state.get("source") in logic.REAL_SOURCES and state.get("last_seen")
    row = _open_row(conn, vehicle_id, "device_offline")
    if real and stale and row is None:
        _open(conn, vehicle_id, "device_offline", state["last_seen"], basis)
    elif row is not None and (not stale or not real):
        _close(conn, row, now(), None)


# ---------------------------------------------------------------- test videos

REPLAY_NOTE = ("Video thử nghiệm do người dùng cung cấp, chưa xác minh nguồn. Thời lượng là thời lượng trong video. "
               "Nhãn nguồn luôn là Mô phỏng và không tính vào số liệu đo thật.")


def replay_outcome(episodes: list[dict[str, Any]]) -> tuple[str, dict[str, Any] | None]:
    """The strongest person/pet episode decides: reportable (>= REPORT_CONF), below the bar, or nothing seen."""
    live = [e for e in episodes if e["kind"] in ("person", "pet")]
    if not live:
        return "none", None
    top = max(live, key=lambda e: e["conf_max"])
    return ("detected" if top["conf_max"] >= REPORT_CONF else "below_threshold"), top


def import_replay(conn: Any, vehicle_id: str, clip: dict[str, Any], model: str, sample_fps: float, started_at: float) -> bool:
    """Record one analysed test video as a sealed log row (basis "simulated"). Returns False if this clip is already in the log."""
    name = clip["clip"]
    for r in conn.execute("SELECT detail FROM cabin_log WHERE vehicle_id=? AND kind='replay'", (vehicle_id,)):
        if db.loads(r["detail"]).get("clip") == name:
            return False
    outcome, top = replay_outcome(clip["episodes"])
    items = sorted({e["name"] for e in clip["episodes"] if e["kind"] == "item" and e["name"]})
    detail = {"clip": name, "model": model, "sample_fps": sample_fps, "samples": clip["sampled"], "note": REPLAY_NOTE,
              "conf_max": top["conf_max"] if top else None, "conf_mean": top["conf_mean"] if top else None,
              "frames_with_detection": top["frames"] if top else 0, "items": items, "dark_samples": clip["dark_samples"]}
    _open(conn, vehicle_id, "replay", started_at, "simulated", seat=top["seat"] if top else None, detail=detail)
    row = _open_row(conn, vehicle_id, "replay")
    _close(conn, row, started_at + float(clip["duration_s"] or 0), outcome)
    return True


# ---------------------------------------------------------------- reading

def _row_json(r: Any, at: float | None = None) -> dict[str, Any]:
    t = at or now()
    end = r["ended_at"]
    d = db.loads(r["detail"])
    return {"id": r["id"], "kind": r["kind"], "label": KIND_LABEL.get(r["kind"], r["kind"]), "started_at": r["started_at"], "ended_at": end,
            "duration_s": round((end or t) - r["started_at"]), "ongoing": end is None, "seat": r["seat"],
            "seat_label": SEAT_LABEL.get(r["seat"] or "", None), "level": r["level"], "incident_id": r["incident_id"],
            "outcome": r["outcome"], "outcome_label": OUTCOME_LABEL.get(r["outcome"], ""), "basis": r["basis"],
            "ack_s": d.get("ack_s"), "notify_s": d.get("notify_s"), "sealed": r["hash"] is not None,
            "clip": d.get("clip"), "conf_max": d.get("conf_max"), "note": d.get("note")}


def listing(vehicle_id: str, days: int = 30, kind: str | None = None) -> list[dict[str, Any]]:
    since = now() - max(1, min(days, 365)) * 86400
    q, args = "SELECT * FROM cabin_log WHERE vehicle_id=? AND started_at>=?", [vehicle_id, since]
    if kind in KINDS:
        q += " AND kind=?"
        args.append(kind)
    elif kind == "activity":                              # everything that is not a left-behind alert: camera, connection, test videos
        q += " AND kind IN ('camera_blocked','device_offline','replay')"
    out = []
    for r in db.all_(q + " ORDER BY started_at DESC LIMIT 500", *args):
        j = _row_json(r)
        floor = {"camera_blocked": CAMERA_MIN_S, "device_offline": OFFLINE_MIN_S}.get(r["kind"], 0)
        if j["ongoing"] and j["duration_s"] < floor:
            continue                                   # still too short to count as an episode
        out.append(j)
    return out


def verify(vehicle_id: str) -> dict[str, Any]:
    """Recompute the chain. The first surviving row is the anchor (older rows may have been deleted by retention)."""
    rows = db.all_("SELECT * FROM cabin_log WHERE vehicle_id=? AND hash IS NOT NULL ORDER BY ended_at, rowid", vehicle_id)
    prev: str | None = None
    for i, r in enumerate(rows):
        if i > 0 and r["prev_hash"] != prev:
            return {"ok": False, "checked": i, "broken_at": r["id"]}
        if _digest(r, r["prev_hash"]) != r["hash"]:
            return {"ok": False, "checked": i, "broken_at": r["id"]}
        prev = r["hash"]
    return {"ok": True, "checked": len(rows), "broken_at": None}


def report(inc: Any) -> dict[str, Any]:
    vid = inc["vehicle_id"]
    row = db.one("SELECT * FROM cabin_log WHERE incident_id=? AND kind='left_behind'", inc["id"])
    end = inc["resolved_at"] or now()
    deliveries = []
    for d in db.all_("SELECT kind,at,status,detail FROM deliveries WHERE incident_id=? ORDER BY at", inc["id"]):
        deliveries.append({"kind": d["kind"], "at": d["at"], "status": d["status"], "detail": d["detail"], "delay_s": round(d["at"] - inc["created_at"], 1)})
    obs = [dict(o) for o in db.all_("SELECT ts,people,children_hint,pets,items,camera_ok,cabin_temp FROM observations WHERE vehicle_id=? AND ts BETWEEN ? AND ? ORDER BY ts",
                                    vid, inc["created_at"] - 60, end)]
    if len(obs) > 80:
        step = len(obs) / 80
        obs = [obs[int(i * step)] for i in range(80)]
    blocked = [_row_json(r) for r in db.all_("SELECT * FROM cabin_log WHERE vehicle_id=? AND kind IN ('camera_blocked','device_offline') AND started_at<=? "
                                               "AND COALESCE(ended_at, ?)>=?", vid, end, now(), inc["created_at"])]
    return {"incident": logic.incident_json(inc, with_detail=True), "log": _row_json(row) if row else None, "deliveries": deliveries,
            "observations": obs, "observations_kept_days": 7, "related": blocked, "chain": verify(vid),
            "notes": "Chỉ lưu số lượng và nhãn ghế, không lưu ảnh. Nhật ký quan sát tự xóa sau 7 ngày; sự cố lưu 365 ngày."}


WEEKDAY = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"]
SEVERITY = {"critical": 3, "warning": 2, "notice": 1, "none": 0}


def _overlap(a0: float, a1: float, b0: float, b1: float) -> float:
    return max(0.0, min(a1, b1) - max(a0, b0))


def summary(vehicle_id: str, days: int = 7, tz_min: int = 420) -> dict[str, Any]:
    """What the top of the History page shows: the last 7 days as a strip (worst thing that day) and how much of the time the vehicle was
    really being watched. Watched time = since the device first existed (or the period start) minus camera-blocked and offline time,
    so a vehicle that never had a device gets no percentage rather than a flattering 100%."""
    days = max(1, min(days, 90))
    tz_min = max(-720, min(tz_min, 840))
    t = now()
    local_midnight = ((t + tz_min * 60) // 86400) * 86400 - tz_min * 60          # start of today in the client's zone, as epoch
    # 7 days = one bar a day; 30 days = one bar a day (narrow); 90 days = one bar a week (13 bars), so the three ranges look different.
    span = 7 if days > 30 else 1
    n = -(-days // span) if span > 1 else (7 if days <= 7 else 30)
    first_day = local_midnight - (n * span - 1) * 86400
    incs = db.all_("SELECT level, status, created_at FROM incidents WHERE vehicle_id=? AND created_at>=?", vehicle_id, first_day)
    logs = db.all_("SELECT kind, started_at, ended_at FROM cabin_log WHERE vehicle_id=? AND kind IN ('camera_blocked','device_offline') "
                   "AND COALESCE(ended_at, ?)>=?", vehicle_id, t, min(first_day, t - days * 86400))
    out_days = []
    for i in range(n):
        d0 = first_day + i * span * 86400
        d1 = d0 + span * 86400
        day_incs = [r for r in incs if d0 <= r["created_at"] < d1]
        cam = off = 0.0
        for r in logs:
            o = _overlap(r["started_at"], r["ended_at"] or t, d0, d1)
            if r["kind"] == "camera_blocked":
                cam += o
            else:
                off += o
        worst = "none"
        for r in day_incs:
            lvl = "critical" if r["level"] == "critical" else "warning"
            if SEVERITY[lvl] > SEVERITY[worst]:
                worst = lvl
        if worst == "none" and cam + off >= 15:
            worst = "notice"
        import datetime as _dt
        ld = _dt.datetime.fromtimestamp(d0 + tz_min * 60, _dt.timezone.utc)
        label = WEEKDAY[ld.weekday()] if n <= 7 else f"{ld.day}" if span == 1 else f"{ld.day}/{ld.month}"
        out_days.append({"start": d0, "span": span, "label": label, "today": i == n - 1, "worst": worst, "incidents": len(day_incs),
                         "open": sum(1 for r in day_incs if r["status"] == "open"), "camera_s": round(cam), "offline_s": round(off)})
    # watched time
    dev = db.one("SELECT MIN(created_at) AS t FROM devices WHERE vehicle_id=?", vehicle_id)
    window0 = max(t - days * 86400, dev["t"]) if dev and dev["t"] else None
    coverage = None
    segments: list[dict[str, Any]] = []
    if window0 is not None and t - window0 >= 60:
        span = t - window0
        spans = sorted(((max(r["started_at"], window0), min(r["ended_at"] or t, t), r["kind"]) for r in logs), key=lambda x: x[0])
        lost, edge = 0.0, window0
        for a, b, kind in spans:
            if b <= a:
                continue
            lost += max(0.0, b - max(a, edge)); edge = max(edge, b)
            segments.append({"kind": kind, "from": round((a - window0) / span, 4), "to": round((b - window0) / span, 4)})
        st = logic.load_state(vehicle_id)
        coverage = {"pct": round(100.0 * (1 - lost / span), 1), "window_s": round(span), "lost_s": round(lost), "segments": segments[:200],
                    "basis": "measured" if st.get("source") in logic.REAL_SOURCES else "simulated",
                    "note": "Tính từ lúc thiết bị được ghép (hoặc đầu khoảng chọn) trừ thời gian camera bị che và mất kết nối."}
    return {"days": out_days, "coverage": coverage, "tz_min": tz_min}


def _median(xs: list[float]) -> float | None:
    return round(statistics.median(xs), 1) if xs else None


def stats(vehicle_id: str, days: int) -> dict[str, Any]:
    rows = listing(vehicle_id, days)
    lb = [r for r in rows if r["kind"] == "left_behind"]
    cam = [r for r in rows if r["kind"] == "camera_blocked"]
    off = [r for r in rows if r["kind"] == "device_offline"]
    closed = [r for r in lb if not r["ongoing"]]
    return {
        "left_behind": len(lb), "critical": sum(1 for r in lb if r["level"] == "critical"), "open": sum(1 for r in lb if r["ongoing"]),
        "confirmed": sum(1 for r in closed if r["outcome"] == "confirmed"), "manual_close": sum(1 for r in closed if r["outcome"] == "manual_close"),
        "median_ack_s": _median([r["ack_s"] for r in lb if r["ack_s"] is not None]),
        "median_resolve_s": _median([r["duration_s"] for r in closed]),
        "median_notify_s": _median([r["notify_s"] for r in lb if r["notify_s"] is not None]),
        "camera_blocked": len(cam), "camera_blocked_min": round(sum(r["duration_s"] for r in cam) / 60, 1),
        "offline": len(off), "offline_min": round(sum(r["duration_s"] for r in off) / 60, 1),
        "basis": sorted({r["basis"] for r in rows}),
    }


def overview(user_id: str, days: int) -> dict[str, Any]:
    days = max(1, min(days, 90))
    rows = db.all_("SELECT m.vehicle_id, m.role, v.name, v.plate FROM members m JOIN vehicles v ON v.id=m.vehicle_id "
                   "WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','confirm','view') ORDER BY v.name", user_id)
    vehicles, total, bases = [], {"left_behind": 0, "critical": 0, "open": 0, "manual_close": 0, "camera_blocked": 0, "camera_blocked_min": 0.0, "offline": 0, "offline_min": 0.0}, set()
    acks: list[float] = []
    notifies: list[float] = []
    for r in rows:
        s = stats(r["vehicle_id"], days)
        st = logic.load_state(r["vehicle_id"])
        stale = logic.is_stale(st)
        real = st.get("source") in logic.REAL_SOURCES
        bases.update(s["basis"])
        for k in total:
            total[k] += s[k]
        if s["median_ack_s"] is not None:
            acks.append(s["median_ack_s"])
        if s["median_notify_s"] is not None:
            notifies.append(s["median_notify_s"])
        vehicles.append({"vehicle_id": r["vehicle_id"], "name": r["name"], "plate": r["plate"], "role": r["role"], **s,
                         "device": {"known": real, "online": real and not stale, "last_seen": st.get("last_seen") if real else None}})
    vehicles.sort(key=lambda v: (-v["open"], -v["critical"], -v["left_behind"], v["name"]))
    total["camera_blocked_min"] = round(total["camera_blocked_min"], 1)
    total["offline_min"] = round(total["offline_min"], 1)
    total.update({"median_ack_s": _median(acks), "median_notify_s": _median(notifies), "vehicles": len(vehicles)})
    return {"days": days, "basis": sorted(bases), "total": total, "vehicles": vehicles}


def csv_text(vehicle_id: str, days: int) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(["loai", "bat_dau", "ket_thuc", "thoi_luong_giay", "ghe", "muc_do", "ket_qua", "nguon_so_lieu", "giay_den_khi_xem", "giay_den_khi_gui_tin", "ma_su_co", "da_niem_phong"])
    for r in reversed(listing(vehicle_id, days)):
        iso = lambda t: "" if t is None else __import__("datetime").datetime.fromtimestamp(t).astimezone().isoformat(timespec="seconds")
        w.writerow([r["kind"], iso(r["started_at"]), iso(r["ended_at"]), r["duration_s"], r["seat"] or "", r["level"] or "", r["outcome"] or ("dang_mo" if r["ongoing"] else ""),
                    r["basis"], r["ack_s"] if r["ack_s"] is not None else "", r["notify_s"] if r["notify_s"] is not None else "", r["incident_id"] or "", "co" if r["sealed"] else "chua"])
    return out.getvalue()
