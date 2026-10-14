"""Telegram alert cards (drawn from data, edited in place, buttons) and opt-in alert photos blurred on the device."""
import io
import json

import pytest

from app import alertcard, alerts, config, db, logic, main, tgcards
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

PERSON = frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9}])


def jpeg(size=(64, 48)):
    from PIL import Image
    out = io.BytesIO()
    Image.new("RGB", size, (90, 90, 90)).save(out, "JPEG")
    return out.getvalue()


@pytest.fixture
def tg(prod, monkeypatch):
    """Telegram on, every Bot API call recorded; sendPhoto returns increasing message ids."""
    calls = []
    counter = iter(range(100, 1000))

    def api(method, fields, files=None):
        calls.append({"method": method, "fields": fields, "files": files})
        if method == "sendPhoto":
            return {"message_id": next(counter)}
        return True
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "test-token")
    monkeypatch.setattr(config, "WEB_BASE_URL", "https://cabin.example")
    tgcards.set_api(api)
    yield prod, calls
    tgcards.set_api(None)


def link(uid, chat="555"):
    with db.tx() as conn:
        conn.execute("INSERT INTO telegram_links(user_id,chat_id,linked_at) VALUES(?,?,?)", (uid, chat, logic.now()))


def test_card_renders_vietnamese_and_marks_the_seat():
    png = alertcard.render({"name": "VF 8", "plate": "30K-018.88"},
                           {"id": "inc_1", "level": "critical", "status": "open", "seat": "rear_right", "confidence": 0.82,
                            "cabin_temp": 38.6, "created_at": 0}, {"rear_right": {"occ": True, "conf": 0.82, "kind": "person"}})
    from PIL import Image
    img = Image.open(io.BytesIO(png))
    assert img.size == (alertcard.W, alertcard.H) and img.getpixel((10, 10)) == alertcard.LEVEL["critical"][0]


def test_incident_goes_to_telegram_as_a_card_with_buttons_and_no_camera_frame(tg):
    (c, clock, sent, _), calls = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    link(uid)
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    card = next(x for x in calls if x["method"] == "sendPhoto")
    assert card["files"]["photo"][2] == "image/png" and card["fields"]["chat_id"] == "555"     # the drawn card, not a JPEG frame
    cap = card["fields"]["caption"]
    assert "CẢNH BÁO" in cap or "NGHIÊM TRỌNG" in cap
    assert "Ghế sau phải" in cap and "90%" in cap
    buttons = [b for row in card["fields"]["reply_markup"]["inline_keyboard"] for b in row]
    assert buttons[0]["url"].startswith("https://cabin.example/app/#/incident/")
    assert {b.get("callback_data", "")[:4] for b in buttons} >= {"ack:", "mute"}
    inc = logic.open_incident(vid)
    assert db.one("SELECT COUNT(*) AS n FROM tg_alerts WHERE incident_id=?", inc["id"])["n"] == 1
    assert not [x for x in calls if x["method"] == "sendPhoto" and x["files"]["photo"][2] == "image/jpeg"]   # photos are off


def test_seen_button_stops_the_reminders_and_edits_the_card(tg):
    (c, clock, sent, _), calls = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    link(uid)
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    inc = logic.open_incident(vid)
    from app import telegram
    telegram.handle_update({"callback_query": {"id": "cb1", "data": f"ack:{inc['id']}", "message": {"chat": {"id": 555, "type": "private"}}}})
    row = db.one("SELECT viewed_by FROM incidents WHERE id=?", inc["id"])
    assert row["viewed_by"].endswith("(Telegram)")
    edit = [x for x in calls if x["method"] == "editMessageMedia"][-1]
    assert "Đã xem" in edit["fields"]["media"]["caption"]
    assert all(b.get("callback_data") != f"ack:{inc['id']}" for r in edit["fields"]["reply_markup"]["inline_keyboard"] for b in r)
    sent.clear()
    clock.t += 130
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    assert not [m for m in sent if "Vẫn chưa ai xem" in m["title"]]
    # someone else's chat cannot acknowledge
    calls.clear()
    telegram.handle_update({"callback_query": {"id": "cb2", "data": f"ack:{inc['id']}", "message": {"chat": {"id": 777, "type": "private"}}}})
    assert "Chưa liên kết" in calls[-1]["fields"]["text"]


def test_closing_the_incident_turns_every_card_green(tg):
    (c, clock, sent, _), calls = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    link(uid)
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)
    inc = logic.open_incident(vid)
    c.post(f"/v1/incidents/{inc['id']}/view", headers=h)
    c.post("/v1/device/telemetry", json=frame(), headers=dh)
    rev = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()["revision"]
    assert c.post(f"/v1/incidents/{inc['id']}/confirm", json={"revision": rev, "checks": ["seats", "floor", "trunk"]}, headers=h).json()["result"] == "resolved"
    alerts.run_once(main.refresh)
    edit = [x for x in calls if x["method"] == "editMessageMedia"][-1]
    assert "ĐÃ ĐÓNG" in edit["fields"]["media"]["caption"]
    assert all("callback_data" not in b for r in edit["fields"]["reply_markup"]["inline_keyboard"] for b in r)


def test_alert_photo_is_off_by_default_owner_only_needs_consent_and_must_be_blurred(tg):
    (c, clock, sent, _), calls = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    hdr = {**dh, "Content-Type": "image/jpeg", "X-Cabin-Blurred": "people"}
    assert c.post("/v1/device/alert-photo", content=jpeg(), headers=hdr).status_code == 403            # off by default
    assert c.get("/v1/vehicles/{}/alert-photo".format(vid), headers=h).json()["enabled"] is False
    assert c.put(f"/v1/vehicles/{vid}/alert-photo", json={"enabled": True}, headers=h).status_code == 422   # consent first
    on = c.put(f"/v1/vehicles/{vid}/alert-photo", json={"enabled": True, "consent": True}, headers=h)
    assert on.status_code == 200 and on.json()["enabled"] is True
    assert c.post("/v1/device/telemetry", json=frame(), headers=dh).json()["alert_photo"] is True    # the device learns it
    assert c.post("/v1/device/alert-photo", content=jpeg(), headers={**dh, "Content-Type": "image/jpeg"}).status_code == 422  # not blurred
    assert c.post("/v1/device/alert-photo", content=b"not a jpeg", headers=hdr).status_code == 422
    # A member who is not the owner cannot change it.
    other_h, _ = login(c, sent, phone="0911000222", name="Khách")
    assert c.put(f"/v1/vehicles/{vid}/alert-photo", json={"enabled": False}, headers=other_h).status_code in (403, 404)


def test_blurred_photo_goes_under_the_card_once_and_expires_after_a_day(tg):
    (c, clock, sent, _), calls = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    link(uid)
    c.put(f"/v1/vehicles/{vid}/alert-photo", json={"enabled": True, "consent": True}, headers=h)
    hdr = {**dh, "Content-Type": "image/jpeg", "X-Cabin-Blurred": "people"}
    c.post("/v1/device/telemetry", json=PERSON, headers=dh)
    alerts.run_once(main.refresh)                     # card first: the alert never waits for a photo
    up = c.post("/v1/device/alert-photo", content=jpeg(), headers=hdr)
    assert up.status_code == 200
    assert c.post("/v1/device/alert-photo", content=jpeg(), headers=hdr).status_code == 429             # one per 30 s
    alerts.run_once(main.refresh)
    alerts.run_once(main.refresh)
    photos = [x for x in calls if x["method"] == "sendPhoto" and x["files"]["photo"][2] == "image/jpeg"]
    assert len(photos) == 1 and photos[0]["fields"]["protect_content"] is True
    assert photos[0]["fields"]["reply_parameters"]["message_id"] >= 100
    inc = logic.open_incident(vid)
    detail = c.get(f"/v1/incidents/{inc['id']}", headers=h).json()
    assert detail["alert_photos"] == [up.json()["id"]]
    assert c.get(f"/v1/incidents/{inc['id']}/card", headers=h).headers["content-type"] == "image/png"
    from app import history as hist
    clock.t += 25 * 3600
    hist.purge(main.MEDIA_DIR, clock.t)
    assert db.one("SELECT COUNT(*) AS n FROM media WHERE kind='alert_photo'")["n"] == 0
    assert json.dumps(detail)  # serialisable
