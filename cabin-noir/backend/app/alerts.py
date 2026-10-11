"""Alert delivery worker. Opens incidents even when nobody has the app open, then really sends what the
escalation plan promises: push to the family, SMS to the owner and emergency contacts. Anything it cannot send
(for example automatic phone calls) is recorded as skipped, never reported as done."""
from __future__ import annotations

from typing import Any, Callable

from . import config, db, logic, push, sms
from .logic import ESCALATION, now

MAX_ATTEMPTS = 3
RETRY_AFTER_S = 15
PUSH_REPEAT_S = 60


def recipients(vehicle_id: str, level: str | None = None) -> list[dict[str, Any]]:
    out = []
    for m in db.all_("SELECT user_id, name, phone, role FROM members WHERE vehicle_id=? AND status='active' AND user_id IS NOT NULL "
                     "AND role IN ('owner','confirm','view')", vehicle_id):
        u = db.one("SELECT settings FROM users WHERE id=?", m["user_id"])
        s = db.loads(u["settings"]) if u else {}
        if level == "warning" and s.get("notify_warning") is False:
            continue
        out.append(dict(m))
    return out


def _deliver(key: str, kind: str, vehicle_id: str, incident_id: str | None, fn: Callable[[], tuple[bool, str]]) -> None:
    """Run `fn` at most once per key (retrying failures a few times). `fn` returns (ok, detail); detail "skipped:..." marks a step we cannot do."""
    row = db.one("SELECT status, attempts, at FROM deliveries WHERE key=?", key)
    if row and (row["status"] in ("ok", "skipped") or row["attempts"] >= MAX_ATTEMPTS or now() - row["at"] < RETRY_AFTER_S):
        return
    ok, detail = fn()
    status = "ok" if ok else ("skipped" if detail.startswith("skipped") else "failed")
    with db.tx() as conn:
        if row:
            conn.execute("UPDATE deliveries SET status=?, detail=?, at=?, attempts=attempts+1 WHERE key=?", (status, detail, now(), key))
        else:
            conn.execute("INSERT INTO deliveries(key,kind,vehicle_id,incident_id,at,status,detail) VALUES(?,?,?,?,?,?,?)",
                         (key, kind, vehicle_id, incident_id, now(), status, detail))


def _push_all(vehicle_id: str, level: str | None, title: str, message: str, urgent: bool) -> tuple[bool, str]:
    people = recipients(vehicle_id, level)
    if not people:
        return False, "skipped: không có ai nhận thông báo"
    sent = sum(1 for p in people if push.notify_user(p["user_id"], title, message, urgent=urgent))
    return sent > 0, f"{sent}/{len(people)} máy"


def _sms(numbers: list[str], text: str) -> tuple[bool, str]:
    if not config.sms_configured():
        return False, "skipped: chưa cấu hình SMS"
    if not numbers:
        return False, "skipped: chưa có số điện thoại"
    results = [sms.send(n, text) for n in numbers]
    ok = sum(1 for r in results if r[0])
    return ok > 0, f"{ok}/{len(numbers)} số"


def _vehicle(vehicle_id: str) -> Any:
    return db.one("SELECT name, plate FROM vehicles WHERE id=?", vehicle_id)


def run_once(refresh: Callable[[str], Any]) -> None:
    t = now()
    # 1. Keep every device-fed vehicle evaluated so incidents open without anyone looking at the app.
    for row in db.all_("SELECT vehicle_id FROM vehicle_state"):
        vid = row["vehicle_id"]
        st = logic.load_state(vid)
        if st.get("source") not in logic.REAL_SOURCES:
            continue
        refresh(vid)
        _device_link(vid)
    # 2. Open incidents.
    for inc in db.all_("SELECT * FROM incidents WHERE status='open'"):
        _incident(inc, t)
    # 3. Tell the family when an incident was closed.
    for inc in db.all_("SELECT * FROM incidents WHERE status='resolved' AND resolved_at>?", t - 300):
        v = _vehicle(inc["vehicle_id"])
        _deliver(f"{inc['id']}:resolved", "resolved", inc["vehicle_id"], inc["id"],
                 lambda inc=inc, v=v: _push_all(inc["vehicle_id"], None, "Đã đóng sự cố",
                                                (f"{inc['resolved_by']}: xe {v['name']} ({v['plate']}) đóng sự cố dù camera vẫn thấy người. Nếu còn thấy người, sự cố mới sẽ được mở."
                                                 if str(inc["resolved_by"]).endswith("(đóng thủ công)")
                                                 else f"{inc['resolved_by']} đã kiểm tra xe {v['name']} ({v['plate']}).")
                                                , False))


def _incident(inc: Any, t: float) -> None:
    vid, iid, level = inc["vehicle_id"], inc["id"], inc["level"]
    v = _vehicle(vid)
    label = f"{v['name']} · {v['plate']}"
    word = "Nghiêm trọng" if level == "critical" else "Cảnh báo"
    _deliver(f"{iid}:lvl:{level}", "level", vid, iid,
             lambda: _push_all(vid, level, f"{word}: có thể có người trong xe", f"{label}. {inc['reason']} Mở ứng dụng để xem việc cần làm.", level == "critical"))
    if inc["viewed_at"] is not None:
        return   # someone saw it: escalation stops, the incident stays open until a confirmed check
    # Repeat the push every minute until someone opens it.
    n = int((t - inc["created_at"]) // PUSH_REPEAT_S)
    if n >= 1:
        _deliver(f"{iid}:rep:{n}", "repeat", vid, iid,
                 lambda: _push_all(vid, level, f"Vẫn chưa ai xem: {word.lower()}", f"{label}. Đã {n} phút. Mở ứng dụng ngay.", level == "critical"))
    owner = db.one("SELECT user_id, phone FROM members WHERE vehicle_id=? AND role='owner'", vid)
    for off, key, _title, _note in ESCALATION:
        if t < inc["created_at"] + off or key == "push":
            continue
        dkey = f"{iid}:{key}"
        if key == "sms_owner":
            fn = (lambda: _sms([owner["phone"]] if owner else [], f"CabinSentinel: có thể có người trong xe {label}. Hãy kiểm tra xe ngay.")) if level == "critical" else (lambda: (False, "skipped: chỉ áp dụng cho Nghiêm trọng"))
        elif key == "sms_contacts":
            nums = [c["phone"] for c in db.all_("SELECT phone FROM contacts WHERE user_id=?", owner["user_id"])] if owner else []
            fn = (lambda nums=nums: _sms(nums, f"CabinSentinel: có thể có người trong xe {label}. Hãy tới kiểm tra hoặc gọi 112.")) if level == "critical" else (lambda: (False, "skipped: chỉ áp dụng cho Nghiêm trọng"))
        elif key == "suggest_112":
            fn = lambda: _push_all(vid, level, "Gọi 112 nếu thấy người trong xe", f"{label}. Ứng dụng không tự gọi 112 và không mở khóa xe.", True)
        else:   # call_owner, call_family: automatic phone calls are not supported
            fn = lambda: (False, "skipped: chưa hỗ trợ gọi tự động")
        _deliver(dkey, key, vid, iid, fn)


def _device_link(vid: str) -> None:
    """Warn once when the in-car device goes quiet (a car that is not being watched must never look safe) and once when it returns."""
    state = logic.load_state(vid)
    v = _vehicle(vid)
    stale = logic.is_stale(state)
    flagged = state.get("offline_notified")
    if stale and not flagged:
        _push_all(vid, None, "Mất kết nối thiết bị trong xe",
                        f"{v['name']} · {v['plate']} chưa được bảo vệ. Kiểm tra nguồn, mạng và ứng dụng trên thiết bị.", True)
        _mark(vid, state, state["last_seen"])
    elif not stale and flagged:
        _push_all(vid, None, "Thiết bị trong xe đã kết nối lại", f"{v['name']} · {v['plate']} đang được bảo vệ.", False)
        _mark(vid, state, None)


def _mark(vid: str, state: dict[str, Any], value: Any) -> None:
    with db.tx() as conn:
        fresh = logic.load_state(vid)
        fresh["offline_notified"] = value
        logic.save_state(conn, vid, fresh)
