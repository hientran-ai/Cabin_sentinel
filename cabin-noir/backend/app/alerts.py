"""Alert delivery worker. Opens incidents even when nobody has the app open, then really sends what the
escalation plan promises: push to the family, SMS to the owner and emergency contacts. Anything it cannot send
(for example automatic phone calls) is recorded as skipped, never reported as done."""
from __future__ import annotations

from typing import Any, Callable

import os

from . import config, db, logic, mute, push, sms, telegram, tgcards
from . import history as hist
from .logic import ESCALATION, now

MAX_ATTEMPTS = 3
RETRY_AFTER_S = 15
PUSH_REPEAT_S = 60
PUSH_MAX_REPEATS = 5          # then stop nagging; the incident stays open and the SMS steps still run
NOTICE_COOLDOWN_S = 1800      # at most one 'device lost' / 'camera lost' notice per vehicle per half hour
CAMERA_GRACE_S = 60           # a camera that is back within a minute is not worth a message


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


def _push_all(vehicle_id: str, level: str | None, title: str, message: str, urgent: bool, url: str | None = None,
              incident_id: str | None = None) -> tuple[bool, str]:
    people = recipients(vehicle_id, level)
    if not people:
        return False, "skipped: không có ai nhận thông báo"
    live = [p for p in people if not mute.active(p["user_id"])]
    if not live:
        return False, "skipped: đang tạm tắt thông báo"
    if incident_id:
        sent = sum(1 for p in live if push.notify_incident(p["user_id"], incident_id, title, message, urgent=urgent, url=url))
    else:
        sent = sum(1 for p in live if push.notify_user(p["user_id"], title, message, urgent=urgent, url=url))
    return sent > 0, f"{sent}/{len(live)} máy" + (f" ({len(people) - len(live)} đang tạm tắt)" if len(live) < len(people) else "")


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
    # 0. Tell people whose temporary mute ran out that alerts are back.
    for uid in mute.expired():
        mute.stop(uid)
        push.notify_user(uid, "Đã bật lại thông báo", "Thời gian tạm tắt đã hết. Cảnh báo xe sẽ gửi tới bạn như bình thường.", False, respect_mute=False)
    # 1. Keep every device-fed vehicle evaluated so incidents open without anyone looking at the app.
    for row in db.all_("SELECT vehicle_id FROM vehicle_state"):
        vid = row["vehicle_id"]
        st = logic.load_state(vid)
        if st.get("source") not in logic.REAL_SOURCES:
            continue
        refresh(vid)
        _device_link(vid)
        _paused_reminder(vid, t)
    # 2. Open incidents.
    for inc in db.all_("SELECT * FROM incidents WHERE status='open'"):
        _incident(inc, t)
    # 3. Tell the family when an incident was closed.
    for inc in db.all_("SELECT * FROM incidents WHERE status='resolved' AND resolved_at>?", t - 300):
        v = _vehicle(inc["vehicle_id"])
        _deliver(f"{inc['id']}:card:resolved", "card", inc["vehicle_id"], inc["id"], lambda inc=inc: tgcards.refresh(inc["id"]))
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
             lambda: _push_all(vid, level, f"{word}: có thể có người trong xe", f"{label}. {inc['reason']} Mở ứng dụng để xem việc cần làm.",
                               level == "critical", f"./#/incident/{iid}", incident_id=iid))
    # A level change sent a new card; bring the older cards of this incident to the same state.
    _deliver(f"{iid}:card:sync:{level}", "card", vid, iid, lambda: tgcards.refresh(iid))
    _alert_photo(inc, t)
    if inc["viewed_at"] is not None:
        # Someone saw it: escalation stops, the incident stays open until a confirmed check. Cards show who saw it.
        _deliver(f"{iid}:card:viewed", "card", vid, iid, lambda: tgcards.refresh(iid))
        return
    # Repeat the push every minute until someone opens it.
    n = int((t - inc["created_at"]) // PUSH_REPEAT_S)
    reminders = db.one("SELECT COUNT(*) AS n FROM deliveries WHERE incident_id=? AND kind='repeat' AND status='ok'", iid)["n"]
    if n >= 1 and reminders < PUSH_MAX_REPEATS:   # muted or skipped reminders do not use up the allowance
        _deliver(f"{iid}:rep:{n}", "repeat", vid, iid,
                 lambda: _push_all(vid, level, f"Vẫn chưa ai xem: {word.lower()}", f"{label}. Đã {n} phút. Mở ứng dụng ngay.", level == "critical", f"./#/incident/{iid}"))
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
            fn = lambda: _push_all(vid, level, "Gọi 112 nếu thấy người trong xe", f"{label}. Ứng dụng không tự gọi 112 và không mở khóa xe.", True, f"./#/incident/{iid}")
        else:   # call_owner, call_family: automatic phone calls are not supported
            fn = lambda: (False, "skipped: chưa hỗ trợ gọi tự động")
        _deliver(dkey, key, vid, iid, fn)


ALERT_PHOTO_WINDOW_S = 120   # a frame sent this long before the incident opened still belongs to it


def _alert_photo(inc: Any, t: float) -> None:
    """Opt-in only: the first blurred frame the device sent for this incident goes under each Telegram card."""
    vid, iid = inc["vehicle_id"], inc["id"]
    if not hist.alert_photo_enabled(vid):
        return
    m = db.one("SELECT * FROM media WHERE vehicle_id=? AND kind='alert_photo' AND expires_at>? AND "
               "(incident_id=? OR (incident_id IS NULL AND created_at>=?)) ORDER BY created_at DESC LIMIT 1",
               vid, t, iid, inc["created_at"] - ALERT_PHOTO_WINDOW_S)
    if m is None:
        return
    if m["incident_id"] is None:
        with db.tx() as conn:
            conn.execute("UPDATE media SET incident_id=? WHERE id=?", (iid, m["id"]))

    def send() -> tuple[bool, str]:
        from .main import MEDIA_DIR
        try:
            with open(os.path.join(MEDIA_DIR, f"{vid}__{m['id']}.{m['ext']}"), "rb") as f:
                data = f.read()
        except OSError:
            return False, "skipped: ảnh đã bị xóa"
        people = [p for p in recipients(vid, inc["level"]) if not mute.active(p["user_id"])]
        chats = [c for c in (telegram.chat_for(p["user_id"]) for p in people) if c] if config.telegram_configured() else []
        if not chats:
            return False, "skipped: không ai nhận qua Telegram"
        ok = sum(1 for c in chats if tgcards.send_photo(c, iid, data))
        return ok > 0, f"{ok}/{len(chats)} chat"
    _deliver(f"{iid}:photo", "photo", vid, iid, send)


PAUSED_REMINDER_S = 6 * 3600


def _paused_reminder(vid: str, t: float) -> None:
    """Monitoring switched off 'until I turn it back on' must not be forgotten: remind the family every few hours."""
    state = logic.load_state(vid)
    if not (state.get("paused_indefinite") and state.get("paused_until", 0) > t):
        return
    v = _vehicle(vid)
    _deliver(f"{vid}:paused:{int(t // PAUSED_REMINDER_S)}", "paused_reminder", vid, None,
             lambda: _push_all(vid, None, "Giám sát xe đang tắt", f"{v['name']} · {v['plate']}: hệ thống không cảnh báo cho tới khi bạn bật lại giám sát trong ứng dụng.", False))


def _save(vid: str, **values: Any) -> None:
    with db.tx() as conn:
        fresh = logic.load_state(vid)
        fresh.update(values)
        logic.save_state(conn, vid, fresh)


def _device_link(vid: str) -> None:
    """Tell the family once when the in-car device goes quiet or its camera stops seeing (a car that is not being watched must
    never look safe), and once when it returns. A phone that keeps losing signal must not turn into a stream of messages:
    notices are rate-limited per vehicle, a reconnect is announced only if the loss was, and a brief camera blink is ignored."""
    state = logic.load_state(vid)
    v = _vehicle(vid)
    t = now()
    label = f"{v['name']} · {v['plate']}"
    if logic.is_stale(state):
        if not state.get("offline_notified"):
            sent = False
            if t - (state.get("offline_notice_at") or 0) >= NOTICE_COOLDOWN_S:
                sent = _push_all(vid, None, "Mất kết nối thiết bị trong xe",
                                 f"{label} chưa được bảo vệ. Kiểm tra nguồn, mạng và ứng dụng trên thiết bị.", True)[0]
            _save(vid, offline_notified=state["last_seen"], offline_sent=sent, **({"offline_notice_at": t} if sent else {}))
        return
    if state.get("offline_notified"):
        if state.get("offline_sent"):
            _push_all(vid, None, "Thiết bị trong xe đã kết nối lại", f"{label} đang được bảo vệ.", False)
        _save(vid, offline_notified=None, offline_sent=False)
    # Device is online: is its camera still seeing?
    if state.get("camera") != "ok":
        since = state.get("camera_bad_since")
        if since is None:
            _save(vid, camera_bad_since=t)
        elif t - since >= CAMERA_GRACE_S and not state.get("camera_notified"):
            sent = False
            if t - (state.get("camera_notice_at") or 0) >= NOTICE_COOLDOWN_S:
                sent = _push_all(vid, None, "Camera trong xe không nhìn được",
                                 f"{label}: camera mất tín hiệu hoặc bị che nên chưa biết ghế sau có ai không. Không coi là xe trống, hãy kiểm tra xe.", True)[0]
            _save(vid, camera_notified=True, camera_sent=sent, **({"camera_notice_at": t} if sent else {}))
    elif state.get("camera_bad_since") is not None:
        if state.get("camera_notified") and state.get("camera_sent"):
            _push_all(vid, None, "Camera trong xe đã nhìn lại được", f"{label} đang được bảo vệ.", False)
        _save(vid, camera_bad_since=None, camera_notified=False, camera_sent=False)
