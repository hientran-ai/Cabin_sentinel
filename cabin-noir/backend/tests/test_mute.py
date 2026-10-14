"""Temporary mute, rate-limited device/camera notices, and a cap on repeat reminders."""
from app import alerts, db, logic, main, mute, telegram
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

PERSON = frame(detections=[{"seat": "rear_mid", "kind": "person", "conf": 0.9}])


def titles(sent):
    return [m["title"] for m in sent]


def test_mute_silences_alerts_ends_itself_and_says_so(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    assert c.post("/v1/me/mute", json={"minutes": 1}, headers=h).status_code == 422      # 5..240 only
    assert c.post("/v1/me/mute", json={"minutes": 241}, headers=h).status_code == 422
    end = c.post("/v1/me/mute", json={"minutes": 30}, headers=h).json()["mute_until"]
    assert end > clock.t and c.get("/v1/me", headers=h).json()["settings"]["mute_until"] == end
    sent.clear()
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    assert not [m for m in sent if "người trong xe" in m["title"]]                       # silenced
    assert db.one("SELECT COUNT(*) AS n FROM incidents WHERE status='open'")["n"] == 1   # but the incident is still recorded
    row = db.one("SELECT status, detail FROM deliveries WHERE kind='level'")
    assert row["status"] == "skipped" and "tạm tắt" in row["detail"]                    # not retried 3 times
    clock.t += 31 * 60
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    assert "Đã bật lại thông báo" in titles(sent)                                         # told it is back
    assert mute.until(uid) == 0
    assert [m for m in sent if "Vẫn chưa ai xem" in m["title"]]                          # and reminders flow again


def test_unmute_and_telegram_commands(prod, monkeypatch):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    replies = []
    monkeypatch.setattr(telegram, "_sender", lambda chat, text, click=None, markup=None: replies.append(text) or True)
    with db.tx() as conn:
        conn.execute("INSERT INTO telegram_links(user_id,chat_id,linked_at) VALUES(?,?,?)", (uid, "555", clock.t))
    upd = lambda text: telegram.handle_update({"message": {"chat": {"id": 555, "type": "private"}, "text": text}})  # noqa: E731
    upd("/tamdung 45")
    assert 44 * 60 < mute.until(uid) - clock.t <= 45 * 60 and "KHÔNG nhận cảnh báo" in replies[-1]
    upd("/trangthai")
    assert "Đang tạm tắt" in replies[-1]
    upd("/bat")
    assert mute.until(uid) == 0 and "Đã bật lại" in replies[-1]
    upd("/tamdung 9999")
    assert mute.until(uid) - clock.t <= mute.MAX_MINUTES * 60                              # capped, never forever
    upd("/tamdung abc")
    assert "Dùng: /tamdung" in replies[-1]
    c.delete("/v1/me/mute", headers=h)
    assert mute.until(uid) == 0
    # a chat that is not linked cannot mute anyone
    telegram.handle_update({"message": {"chat": {"id": 999, "type": "private"}, "text": "/tamdung"}})
    assert "Chưa liên kết" in replies[-1]


def test_flapping_connection_makes_one_notice_not_a_stream(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    alerts.run_once(main.refresh)
    sent.clear()
    for _ in range(4):                                       # the phone drops off and returns four times in 20 minutes
        clock.t += logic.STALE_AFTER_S + 10
        alerts.run_once(main.refresh)
        c.post("/v1/device/telemetry", json=frame(), headers=dh)
        alerts.run_once(main.refresh)
        clock.t += 60
    assert len([m for m in sent if "Mất kết nối thiết bị" in m["title"]]) == 1
    assert len([m for m in sent if "đã kết nối lại" in m["title"]]) == 1
    clock.t += alerts.NOTICE_COOLDOWN_S
    clock.t += logic.STALE_AFTER_S + 10
    alerts.run_once(main.refresh)
    assert len([m for m in sent if "Mất kết nối thiết bị" in m["title"]]) == 2             # a later loss is announced again


def test_camera_disconnect_is_announced_once_after_a_grace_and_recovery_too(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    alerts.run_once(main.refresh)
    sent.clear()
    c.post("/v1/device/telemetry", json=frame(camera_ok=False), headers=dh)
    alerts.run_once(main.refresh)
    assert not [m for m in sent if "Camera" in m["title"]]                                  # a blink is ignored
    clock.t += alerts.CAMERA_GRACE_S + 5
    c.post("/v1/device/telemetry", json=frame(camera_ok=False), headers=dh)
    alerts.run_once(main.refresh)
    alerts.run_once(main.refresh)
    cam = [m for m in sent if m["title"] == "Camera trong xe không nhìn được"]
    assert len(cam) == 1 and cam[0]["prio"] == 5 and "Không coi là xe trống" in cam[0]["msg"]
    s = c.get(f"/v1/vehicles/{vid}/status", headers=h).json()
    assert s["verdict"]["level"] != "safe"                                                  # never looks safe
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    alerts.run_once(main.refresh)
    assert len([m for m in sent if "đã nhìn lại được" in m["title"]]) == 1


def test_repeat_reminders_stop_after_five(prod):
    c, clock, sent, _ = prod
    h, uid, vid, dh, _ = setup_car(c, sent)
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    for _ in range(12):
        clock.t += alerts.PUSH_REPEAT_S
        c.post("/v1/device/telemetry", json=PERSON, headers=dh)
        alerts.run_once(main.refresh)
    assert len([m for m in sent if "Vẫn chưa ai xem" in m["title"]]) == alerts.PUSH_MAX_REPEATS
