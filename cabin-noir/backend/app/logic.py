"""Domain rules: cabin evaluation, incident lifecycle, escalation, climate, trips.

Everything here is deterministic. The backend decides the risk level; the app only renders it.
Missing or stale data never becomes "safe".
"""
from __future__ import annotations

import time
import uuid
from typing import Any, Callable

from . import config, db

_clock: Callable[[], float] = time.time


def distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    import math
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(a))


def now() -> float:
    return _clock()


def set_clock(fn: Callable[[], float]) -> None:
    global _clock
    _clock = fn


def new_id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


HOT_C = 35.0
STALE_AFTER_S = 120
PAUSE_FOREVER = 4102444800.0      # 2100-01-01: 'until I turn it back on'
# The cabin is one zone: the device reports what it sees anywhere inside, never which seat. A person the camera finds
# outside a drawn seat box must count all the same, and a seat map invites reading an empty box as "nobody there".
SEATS = ["cabin"]
SEAT_LABEL = {"cabin": "Trong xe"}
# Seat keys written before the cabin became one zone (old incidents, logs and stored state).
LEGACY_SEATS = ("driver", "passenger", "rear_left", "rear_mid", "rear_right")


def empty_cabin() -> dict[str, Any]:
    return {"occ": False, "conf": 0.0, "kind": None, "people": 0, "pets": 0, "children": 0, "dets": []}


def cabin_from(dets: list[dict[str, Any]]) -> dict[str, Any]:
    """One cabin cell from every detection the device made (conf >= 0.5 already applied). Any person makes it a person:
    a pet beside a child must not turn the alert into "thú cưng"."""
    cell = empty_cabin()
    if not dets:
        return cell
    people = [d for d in dets if d["kind"] == "person"]
    pets = [d for d in dets if d["kind"] == "pet"]
    top = max(people or pets, key=lambda d: d["conf"])
    cell.update({"occ": True, "conf": round(top["conf"], 2), "kind": top["kind"], "age": top.get("age"), "box": top.get("box"),
                 "people": len(people), "pets": len(pets), "children": sum(1 for d in people if d.get("age") == "child"),
                 "dets": [{k: d.get(k) for k in ("kind", "conf", "age", "box")} for d in sorted(dets, key=lambda d: -d["conf"])]})
    return cell


def who_text(cell: dict[str, Any]) -> str:
    """'2 người, 1 thú cưng' from a cabin cell (at least '1 người' / '1 thú cưng' for an occupied one)."""
    people, pets = cell.get("people") or 0, cell.get("pets") or 0
    if not people and not pets and cell.get("occ"):
        people, pets = (0, 1) if cell.get("kind") == "pet" else (1, 0)
    parts = [f"{people} người" if people else "", f"{pets} thú cưng" if pets else ""]
    return ", ".join(p for p in parts if p) or "không thấy ai"


def normalise_seats(state: dict[str, Any]) -> dict[str, Any]:
    """State saved with five seats becomes one cabin cell, keeping every occupant it had."""
    seats = state.get("seats") or {}
    if set(seats) == {"cabin"}:
        return state
    dets = [{"kind": v.get("kind") or "person", "conf": v.get("conf", 0.0), "age": v.get("age"), "box": v.get("box")}
            for k, v in seats.items() if v.get("occ") and (k != "driver" or not state.get("engine_on"))]
    state["seats"] = {"cabin": cabin_from(dets)}
    state["items"] = [{k: v for k, v in i.items() if k != "seat"} for i in state.get("items") or []]
    return state
REAL_SOURCES = ("phone", "device")   # anything else is the simulator
ESCALATION = [
    (0, "push", "Thông báo khẩn tới mọi điện thoại trong gia đình", "Nhắc lại mỗi 60 giây"),
    (30, "sms_owner", "SMS tới chủ xe", "Nếu chưa ai mở cảnh báo"),
    (60, "call_owner", "Gọi tự động tới chủ xe", "Gọi lại một lần nếu không nghe máy"),
    (90, "sms_contacts", "SMS người liên hệ khẩn cấp", "Áp dụng cho sự cố Nghiêm trọng"),
    (120, "call_family", "Gọi người nhà dùng chung ứng dụng", "Người có quyền Xem và xác nhận"),
    (180, "suggest_112", "Gợi ý gọi 112", "Ứng dụng không tự gọi 112 và không mở khóa xe"),
]


# ---------------------------------------------------------------- vehicle state

def base_state() -> dict[str, Any]:
    return {
        "scenario": "safe", "connection": "online", "last_seen": now(), "camera": "ok",
        "battery": 82, "signal": 4, "doors_locked": True, "engine_on": False,
        "cabin_temp": 32.0, "outside_temp": 34.0, "location": "Nhà",
        "seats": {"cabin": empty_cabin()},
        "items": [], "exit_confirmed_at": None, "t_at": now(),
    }


SCENARIOS = [
    "safe", "warning", "critical", "camera_blocked", "offline", "items_left", "driving",
    "exit_child", "presence_clear", "low_battery",
    "trip_boarded", "trip_enroute", "trip_arrived", "trip_late", "trip_leftin", "trip_reset",
    "climate_fail_on", "climate_fail_off", "route_start", "route_stop",
]

# A short fixed drive for demos: home -> school, ~2 minutes, linear between waypoints.
DEMO_ROUTE = {
    "duration_s": 120,
    "dest": {"name": "Trường TH Kim Đồng", "lat": 10.7840, "lon": 106.7070},
    "points": [(10.7721, 106.6980), (10.7769, 106.7009), (10.7800, 106.7040), (10.7840, 106.7070)],
}


def apply_scenario(state: dict[str, Any], name: str) -> dict[str, Any]:
    t = now()
    s = dict(state)
    if not name.startswith(("trip_", "climate_fail", "route_")):
        for k in ("source", "coords", "route"):
            s.pop(k, None)
    s["seats"] = {k: dict(v) for k, v in state["seats"].items()}
    clear = {"cabin": empty_cabin()}

    def seen(conf: float, kind: str = "person") -> None:
        s["seats"] = {"cabin": cabin_from([{"kind": kind, "conf": conf, "age": None, "box": None}])}

    def reset(**kw: Any) -> None:
        s.update({"connection": "online", "last_seen": t, "camera": "ok", "doors_locked": True,
                  "engine_on": False, "seats": {k: dict(v) for k, v in clear.items()}, "items": []})
        s.update(kw)

    if name == "safe":
        reset(cabin_temp=32.0, location="Nhà")
    elif name == "warning":
        reset(cabin_temp=34.0)
        seen(0.64)
    elif name == "critical":
        reset(cabin_temp=40.0)
        seen(0.82)
    elif name == "camera_blocked":
        s.update({"camera": "blocked", "connection": "online", "last_seen": t})
    elif name == "offline":
        s.update({"connection": "offline", "last_seen": t - 900})
    elif name == "items_left":
        reset(cabin_temp=31.0, items=[
            {"name": "Ba lô", "conf": 0.91},
            {"name": "Điện thoại", "conf": 0.87},
            {"name": "Chai nước", "conf": 0.78}])
    elif name == "driving":
        reset(engine_on=True, doors_locked=False, cabin_temp=26.0)
        seen(0.98)
    elif name == "exit_child":
        reset(engine_on=False, doors_locked=False, cabin_temp=29.0, location="Trường TH Kim Đồng", exit_confirmed_at=None)
        seen(0.9)
    elif name == "presence_clear":
        s.update({"seats": {k: dict(v) for k, v in clear.items()}, "connection": "online", "last_seen": t, "camera": "ok"})
    elif name == "low_battery":
        s.update({"battery": 18, "connection": "online", "last_seen": t})
    elif name == "trip_leftin":
        reset(cabin_temp=36.0, location="Trường TH Kim Đồng")
        seen(0.74)
    elif name == "route_start":
        s["route"] = {"started_at": t, **DEMO_ROUTE}
        s["trip_origin"] = {"name": "Nhà", "lat": DEMO_ROUTE["points"][0][0], "lon": DEMO_ROUTE["points"][0][1]}
        s["source"] = "sim"
        s["coords"] = route_position(s["route"], t)
        s["location"] = "Đang di chuyển"
        s.update({"engine_on": True, "doors_locked": False, "connection": "online", "last_seen": t})
    elif name == "route_stop":
        s.pop("route", None)
        s["engine_on"] = False
    elif name == "climate_fail_on":
        s["climate_fail"] = True
    elif name == "climate_fail_off":
        s["climate_fail"] = False
    else:
        s["last_seen"] = t
    if name not in ("climate_fail_on", "climate_fail_off", "route_start", "route_stop", "trip_boarded", "trip_enroute", "trip_arrived", "trip_late", "trip_reset"):
        s["scenario"] = name
    s["t_at"] = t
    return s


def route_position(route: dict[str, Any], t: float) -> dict[str, Any]:
    pts = route["points"]
    prog = min(1.0, max(0.0, (t - route["started_at"]) / route["duration_s"]))
    seg = min(len(pts) - 2, int(prog * (len(pts) - 1)))
    f = prog * (len(pts) - 1) - seg
    (a, b), (c, d) = pts[seg], pts[seg + 1]
    import math
    heading = (math.degrees(math.atan2(d - b, c - a)) + 360) % 360  # 0 = east; converted below
    heading = (90 - heading) % 360  # compass bearing, 0 = north
    return {"lat": a + (c - a) * f, "lon": b + (d - b) * f, "accuracy_m": 5, "at": t, "heading": round(heading), "progress": round(prog, 3)}


def load_state(vehicle_id: str) -> dict[str, Any]:
    row = db.one("SELECT data FROM vehicle_state WHERE vehicle_id=?", vehicle_id)
    return normalise_seats(db.loads(row["data"])) if row else base_state()


def save_state(conn: Any, vehicle_id: str, state: dict[str, Any]) -> None:
    conn.execute(
        "INSERT INTO vehicle_state(vehicle_id,data,updated_at) VALUES(?,?,?) "
        "ON CONFLICT(vehicle_id) DO UPDATE SET data=excluded.data, updated_at=excluded.updated_at",
        (vehicle_id, db.dumps(state), now()))


def presence(state: dict[str, Any]) -> list[tuple[str, dict[str, Any]]]:
    """[("cabin", cell)] when the device sees someone in the car, else []. While the engine runs the driver is in the
    picture; monitoring is paused then anyway (evaluate)."""
    return [(k, v) for k, v in state["seats"].items() if v.get("occ")]


def is_stale(state: dict[str, Any]) -> bool:
    return state["connection"] != "online" or now() - state["last_seen"] > STALE_AFTER_S


def hms(t: float | None) -> str:
    return time.strftime("%H:%M:%S", time.localtime(t)) if t else "—"


def hot(state: dict[str, Any]) -> tuple[bool, str]:
    """Is the cabin dangerously hot, and how to say so. Without a cabin sensor the outside temperature decides."""
    if state.get("temp_known", True):
        t = round(state["cabin_temp"], 1)
        return t >= HOT_C, f"Cabin {t:g}°C"
    out = state.get("outside_temp")
    if out is None:
        return False, "Chưa có nhiệt độ"
    return out >= config.HOT_OUTSIDE_C, f"Ngoài trời {out:g}°C, chưa có cảm biến trong cabin"


def evaluate(state: dict[str, Any]) -> dict[str, Any]:
    """Return the backend verdict for the current cabin data."""
    pres = presence(state)
    if is_stale(state):
        return {"level": "unknown", "title": "Chưa thể đánh giá cabin",
                "sub": f"Mất kết nối với xe từ {hms(state['last_seen'])}. Lần cuối có thể không còn đúng.",
                "current": False}
    if state.get("thermal") in ("serious", "critical") and not pres:
        return {"level": "unknown", "title": "Thiết bị trong xe quá nóng",
                "sub": "Thiết bị báo nhiệt độ cao và có thể ngừng hoạt động bất cứ lúc nào. Chưa thể đánh giá cabin.",
                "current": False}
    if state["engine_on"]:
        return {"level": "paused", "title": "Xe đang chạy", "sub": "Tạm dừng giám sát cabin khi có tài xế.", "current": True}
    if state.get("paused_until", 0) > now():
        if state.get("paused_indefinite"):
            return {"level": "paused", "title": "Đã tạm dừng giám sát", "sub": "Giám sát không tự bật lại. Bấm Bật lại giám sát khi bạn muốn tiếp tục.",
                    "current": True, "paused_until": state["paused_until"], "paused_indefinite": True}
        return {"level": "paused", "title": "Đã tạm dừng giám sát", "sub": f"Đến {hms(state['paused_until'])[:5]}, sau đó tự giám sát lại.",
                "current": True, "paused_until": state["paused_until"]}
    if state["camera"] != "ok":
        return {"level": "notice", "title": "Chưa nhìn được trong xe",
                "sub": "Camera đang bị che nên chưa biết trong xe có ai không. Không coi là xe trống, hãy kiểm tra xe." if not state.get("lock_known", True)
                else "Camera đang bị che. Cửa và nhiệt độ vẫn được theo dõi.", "current": True}
    locked = state["doors_locked"]
    if pres and locked:
        seat, info = max(pres, key=lambda p: p[1]["conf"])
        pct = round(info["conf"] * 100)
        who = "thú cưng" if info.get("kind") == "pet" else "người"
        is_hot, temp_text = hot(state)
        parked = "xe đã khóa" if state.get("lock_known", True) else "xe đang đỗ, tắt máy"
        return {"level": "critical" if is_hot else "warning", "title": f"Có thể có {who} trong xe",
                "sub": f"Thấy {who_text(info)} · {pct}%. {temp_text}, {parked}.", "seat": seat, "conf": info["conf"], "current": True}
    if pres:
        return {"level": "notice", "title": "Có người trong xe", "sub": "Xe chưa khóa. Kiểm tra trong xe trước khi rời xe.", "current": True}
    return {"level": "safe", "title": "Không thấy ai trong xe", "sub": f"Cập nhật {hms(state['last_seen'])}", "current": True}


# ---------------------------------------------------------------- climate

def load_climate(vehicle_id: str) -> dict[str, Any]:
    row = db.one("SELECT data FROM climate WHERE vehicle_id=?", vehicle_id)
    if row:
        return db.loads(row["data"])
    return {"status": "off", "target": 22, "mode": "cool", "fan": "auto", "duration_min": 20,
            "requested_at": None, "started_at": None, "ends_at": None, "auto": False}


def save_climate(conn: Any, vehicle_id: str, c: dict[str, Any]) -> None:
    conn.execute("INSERT INTO climate(vehicle_id,data) VALUES(?,?) ON CONFLICT(vehicle_id) DO UPDATE SET data=excluded.data",
                 (vehicle_id, db.dumps(c)))


def advance(conn: Any, vehicle_id: str) -> tuple[dict[str, Any], dict[str, Any]]:
    """Move simulated time forward: climate state machine and cabin temperature."""
    t = now()
    state, c = load_state(vehicle_id), load_climate(vehicle_id)
    changed = False
    if c["status"] == "sending" and t - c["requested_at"] >= 1.5:
        if is_stale(state) or state.get("climate_fail"):
            c["status"] = "fail"
            add_event(conn, vehicle_id, None, "climate", "Xe chưa phản hồi lệnh điều hòa", "Kiểm tra sóng di động rồi thử lại")
        else:
            c["status"], c["started_at"] = "on", c["requested_at"] + 1.5
            c["ends_at"] = c["started_at"] + c["duration_min"] * 60
            add_event(conn, vehicle_id, None, "climate", "Điều hòa đã bật", f"Mục tiêu {c['target']}°C · {c['duration_min']} phút")
        changed = True
    dt = max(0.0, t - state.get("t_at", t))
    if c["status"] == "on" and not is_stale(state):
        run_until = min(t, c["ends_at"])
        eff = max(0.0, run_until - max(state.get("t_at", t), c["started_at"]))
        if c["mode"] != "fan" and eff > 0:
            step = 0.25 * eff
            cur = state["cabin_temp"]
            state["cabin_temp"] = max(c["target"], cur - step) if c["mode"] == "cool" else min(c["target"], cur + step)
        if t >= c["ends_at"]:
            c["status"] = "off"
            add_event(conn, vehicle_id, None, "climate", "Điều hòa đã tắt", "Hết thời gian chạy")
        changed = True
    if dt > 0:
        state["t_at"] = t
        if state.get("route") and not is_stale(state):
            state["coords"] = route_position(state["route"], t)
            if state["coords"]["progress"] >= 1.0:
                state.pop("route")
                hhmm = time.strftime("%H:%M", time.localtime(t))
                for tr in conn.execute("SELECT id, log FROM trips WHERE vehicle_id=? AND stage='enroute'", (vehicle_id,)).fetchall():
                    conn.execute("UPDATE trips SET stage='arrived', log=?, updated_at=? WHERE id=?",
                                 (db.dumps(db.loads(tr["log"]) + [f"arrived@{hhmm}#g"]), t, tr["id"]))
                add_event(conn, vehicle_id, None, "trip", "Xe đã tới trường", "Theo vị trí xe (mô phỏng)")
                state.update({"engine_on": False, "location": state["route_dest_name"] if "route_dest_name" in state else DEMO_ROUTE["dest"]["name"]})
        if state["connection"] == "online" and state.get("source") not in REAL_SOURCES:
            state["last_seen"] = t  # the simulated device keeps reporting while online; a real source must report itself
        save_state(conn, vehicle_id, state)
    if changed:
        save_climate(conn, vehicle_id, c)
    return state, c


# ---------------------------------------------------------------- incidents

def add_event(conn: Any, vehicle_id: str, incident_id: str | None, kind: str, title: str, detail: str) -> None:
    conn.execute("INSERT INTO events(vehicle_id,incident_id,at,kind,title,detail) VALUES(?,?,?,?,?,?)",
                 (vehicle_id, incident_id, now(), kind, title, detail))


def open_incident(vehicle_id: str) -> Any:
    return db.one("SELECT * FROM incidents WHERE vehicle_id=? AND status='open' ORDER BY created_at DESC LIMIT 1", vehicle_id)


RANK = {"warning": 1, "critical": 2}


def sync_incident(conn: Any, vehicle_id: str, state: dict[str, Any], verdict: dict[str, Any]) -> None:
    """Open, escalate or annotate the incident. Only a confirmed cabin check closes it."""
    inc = conn.execute("SELECT * FROM incidents WHERE vehicle_id=? AND status='open' ORDER BY created_at DESC LIMIT 1",
                       (vehicle_id,)).fetchone()
    lvl = verdict["level"]
    # Without a cabin sensor there is no cabin temperature to keep: the model value is not a measurement.
    cabin_t = state["cabin_temp"] if state.get("temp_known", True) else None
    if lvl in RANK:
        if inc is None:
            iid = new_id("inc")
            conn.execute(
                "INSERT INTO incidents(id,vehicle_id,level,status,revision,created_at,seat,confidence,cabin_temp,reason) "
                "VALUES(?,?,?,?,?,?,?,?,?,?)",
                (iid, vehicle_id, lvl, "open", 1, now(), verdict.get("seat"), verdict.get("conf"), cabin_t, verdict["sub"]))
            add_event(conn, vehicle_id, iid, "incident", f"{'Nghiêm trọng' if lvl == 'critical' else 'Cảnh báo'}: {verdict['title']}", verdict["sub"])
        elif RANK[lvl] > RANK.get(inc["level"], 0):
            conn.execute("UPDATE incidents SET level=?, revision=revision+1, cabin_temp=?, confidence=?, reason=? WHERE id=?",
                         (lvl, cabin_t, verdict.get("conf"), verdict["sub"], inc["id"]))
            add_event(conn, vehicle_id, inc["id"], "incident", "Nâng lên Nghiêm trọng", verdict["sub"])
    elif inc is not None and lvl in ("safe", "notice", "unknown"):
        last = conn.execute("SELECT title FROM events WHERE incident_id=? AND kind IN ('data','incident') ORDER BY id DESC LIMIT 1", (inc["id"],)).fetchone()
        title = {"safe": "Không còn phát hiện người", "notice": "Dữ liệu thay đổi", "unknown": "Mất dữ liệu từ xe"}[lvl]
        if last is None or last["title"] != title:
            conn.execute("UPDATE incidents SET revision=revision+1 WHERE id=?", (inc["id"],))
            add_event(conn, vehicle_id, inc["id"], "data", title, "Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe")


def escalation(inc: Any) -> dict[str, Any]:
    t = now()
    created = inc["created_at"]
    stop_at = inc["viewed_at"] or inc["resolved_at"]
    steps, current = [], 0
    for i, (off, key, title, note) in enumerate(ESCALATION):
        at = created + off
        detail = ""
        if stop_at is not None and stop_at < at:
            st = "stopped"
        elif t >= at:
            st = "done"
            if config.PRODUCTION:   # only claim what was really sent
                if key == "push":   # the first push of the incident is delivered as "<id>:lvl:<level>"
                    row = db.one("SELECT status, detail FROM deliveries WHERE key LIKE ? ORDER BY at LIMIT 1", f"{inc['id']}:lvl:%")
                else:
                    row = db.one("SELECT status, detail FROM deliveries WHERE key=?", f"{inc['id']}:{key}")
                if row is None:
                    st = "pending"
                else:
                    st = {"ok": "done", "skipped": "skipped"}.get(row["status"], "failed")
                    detail = row["detail"]
        else:
            st = "pending"
        if st == "done":
            current = i
        steps.append({"offset": off, "key": key, "title": title, "note": note, "state": st, "at": at, "detail": detail})
    nxt = next((s for s in steps if s["state"] == "pending"), None)
    return {"steps": steps, "current": current, "next_in": None if nxt is None else max(0, round(nxt["at"] - t)),
            "stopped": stop_at is not None}


def incident_json(inc: Any, with_detail: bool = False) -> dict[str, Any]:
    d = {k: inc[k] for k in inc.keys()}
    d["seat_label"] = SEAT_LABEL.get(inc["seat"] or "", None)
    if "chưa có cảm biến trong cabin" in (inc["reason"] or ""):
        d["cabin_temp"] = None          # older rows stored a model value although the car had no cabin sensor
    d["elapsed"] = round(now() - inc["created_at"])
    if with_detail:
        d["escalation"] = escalation(inc)
        d["events"] = [dict(r) for r in db.all_("SELECT at,kind,title,detail FROM events WHERE incident_id=? ORDER BY id", inc["id"])]
        d["alert_photos"] = [r["id"] for r in db.all_("SELECT id FROM media WHERE incident_id=? AND kind='alert_photo' AND expires_at>? "
                                                     "ORDER BY created_at", inc["id"], now())]
    return d


def check_resolve(state: dict[str, Any], inc: Any, revision: int) -> str | None:
    if revision != inc["revision"]:
        return "changed"
    if is_stale(state):
        return "stale"
    if state["camera"] != "ok":
        return "camera"
    if presence(state):
        return "presence"
    return None


REJECT_TEXT = {
    "changed": ("Sự cố đã thay đổi", "Có dữ liệu mới từ xe sau khi bạn mở màn này. Xem lại rồi xác nhận lần nữa."),
    "stale": ("Dữ liệu đã cũ", "Xe chưa gửi dữ liệu mới. Yêu cầu dữ liệu mới rồi gửi lại."),
    "camera": ("Camera chưa nhìn được trong xe", "Lấy vật che camera ra để hệ thống xác minh."),
    "presence": ("Vẫn phát hiện người trong xe", "Hệ thống vẫn thấy có người. Kiểm tra lại các ghế và sàn xe."),
}


# ---------------------------------------------------------------- protection / device health

def protection(state: dict[str, Any]) -> dict[str, Any]:
    rows = []
    stale = is_stale(state)
    real = state.get("source") in REAL_SOURCES
    sig = state.get("signal")
    rows.append({"key": "connection", "label": "Kết nối với xe",
                 "detail": f"Lần cuối {hms(state['last_seen'])}" if stale else (f"Sóng {sig}/5 · cập nhật {hms(state['last_seen'])}" if sig else f"Cập nhật {hms(state['last_seen'])}"),
                 "status": "bad" if stale else "good",
                 "fix": ("Thiết bị trong xe không gửi dữ liệu. Kiểm tra nguồn, mạng và app trên thiết bị." if real
                         else "Xe có thể ở nơi mất sóng như hầm gửi xe. Thiết bị tự kết nối lại khi có sóng.") if stale else None})
    cam_bad = state["camera"] != "ok"
    rows.append({"key": "camera", "label": "Camera trong xe",
                 "detail": "Không rõ" if stale else ("Bị che" if cam_bad else "Nhìn rõ trong xe"),
                 "status": "unknown" if stale else ("bad" if cam_bad else "good"),
                 "fix": "Lấy vật che ống kính ra, ví dụ áo khoác hoặc túi." if cam_bad and not stale else None})
    if state.get("lock_known", True):
        rows.append({"key": "doors", "label": "Cảm biến cửa", "detail": "Không rõ" if stale else ("Đã khóa" if state["doors_locked"] else "Chưa khóa"),
                     "status": "unknown" if stale else "good", "fix": None})
    else:
        rows.append({"key": "doors", "label": "Cảm biến cửa", "detail": "Không có. Khi xe đỗ và tắt máy, hệ thống coi như đã khóa.",
                     "status": "unknown", "fix": "Dùng nút Tạm dừng giám sát khi bạn ngồi trong xe đang đỗ."})
    rows.append({"key": "seats", "label": "Nhận diện trong xe", "detail": "Không rõ" if stale else ("Camera nhìn trong xe" if real else "Mô phỏng · hoạt động"),
                 "status": "unknown" if stale else "good", "fix": None})
    low = state["battery"] < 20 and not state.get("charging")
    rows.append({"key": "battery", "label": "Pin thiết bị", "detail": f"{state['battery']}%" + (" · đang sạc" if state.get("charging") else "") + (" · sắp hết" if low else ""),
                 "status": "unknown" if stale else ("warn" if low else "good"),
                 "fix": "Cắm sạc thiết bị hoặc nổ máy xe 15 phút." if low and not stale else None})
    th = state.get("thermal")
    hot_dev = th in ("serious", "critical")
    if th:
        rows.append({"key": "thermal", "label": "Nhiệt độ thiết bị",
                     "detail": {"nominal": "Bình thường", "fair": "Hơi ấm", "serious": "Nóng, hiệu năng giảm", "critical": "Quá nóng, có thể tắt"}.get(th, th),
                     "status": "unknown" if stale else ("bad" if th == "critical" else "warn" if th == "serious" else "good"),
                     "fix": "Đưa thiết bị ra khỏi nắng, tắt bớt độ sáng màn hình hoặc dùng thiết bị chịu nhiệt tốt hơn." if hot_dev and not stale else None})
    if stale:
        level, title = "off", "Chưa được bảo vệ"
    elif cam_bad or low or hot_dev:
        level, title = "partial", "Bảo vệ một phần"
    else:
        level, title = "ok", "Đang bảo vệ"
    return {"level": level, "title": title, "battery": state["battery"], "rows": rows}


# ---------------------------------------------------------------- school trips

TRIP_STAGES = ["waiting", "boarded", "enroute", "arrived", "late", "leftin"]
TRIP_LOG = {
    "boarded": ("06:52", "{n} lên xe", "Tại Nhà", "Camera trong xe"),
    "enroute": ("06:53", "Xe bắt đầu chạy", "Đang trên đường tới trường", "Vị trí xe"),
    "arrived": ("07:18", "{n} xuống xe", "Đã tới điểm đến", "Camera · vị trí xe"),
    "late": ("07:00", "Chưa thấy {n} lên xe", "Đã quá giờ đón 15 phút. Đã nhắc người đưa đón.", "Lịch đưa đón"),
    "leftin": ("07:24", "Xe đã đỗ, camera vẫn thấy người", "Đã báo cả gia đình", "Camera trong xe"),
}
