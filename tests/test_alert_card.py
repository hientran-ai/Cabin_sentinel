"""Telegram alert card (drawn from data) and the opt-in, pixelated alert photo of the camera simulator."""

import io
from datetime import timedelta

import httpx
import numpy as np
from PIL import Image

from src.cabinsentinel import alert_card, notify, video_sim
from tests.test_platform_api import auth, make_admin
from tests.test_video_sim import REF_SEATS, VEHICLE, cabin, jpg, person, studio  # noqa: F401


def test_card_is_a_png_in_the_risk_colour_with_the_seats():
    png = alert_card.render("VF8-DEMO-01", {"risk_level": "CRITICAL", "rule_id": "HOT_OCCUPANT", "temperature": 38.6,
                                            "occupancy_state": "PRESENT"},
                            {"rear_right": {"state": "SEAT_CHANGED"}, "rear_left": {"state": "EMPTY_VERIFIED"}}, label="SIMULATED")
    img = Image.open(io.BytesIO(png))
    assert img.size == (alert_card.W, alert_card.H) and img.getpixel((5, 5)) == alert_card.LEVEL["CRITICAL"][0]


def test_telegram_gets_the_card_as_a_photo_and_never_raises(monkeypatch):
    seen = []

    def handler(request):
        seen.append((request.url.path, request.headers.get("content-type", "")))
        return httpx.Response(200, json={"ok": True})
    settings = notify.get_settings()
    monkeypatch.setattr(settings, "telegram_chat_id", "42")
    monkeypatch.setattr(settings, "telegram_bot_token", type(settings.telegram_bot_token)("token"))
    monkeypatch.setattr(settings, "ntfy_topic", "")
    with httpx.Client(transport=httpx.MockTransport(handler)) as client:
        out = notify.deliver("CabinSentinel: có người trong xe", "Xe VF8", urgent=True, client=client, card=b"\x89PNG fake")
        assert out == [{"channel": "telegram", "ok": True}]
        assert seen[-1][0].endswith("/sendPhoto") and seen[-1][1].startswith("multipart/form-data")
        notify.deliver("t", "b", client=client)
        assert seen[-1][0].endswith("/sendMessage")          # no card: plain text, as before
        assert notify.deliver_photo(b"\xff\xd8jpg", "caption", client=client) is True

    def broken(request):
        raise httpx.ConnectError("boom https://api.telegram.org/bottoken/x")
    with httpx.Client(transport=httpx.MockTransport(broken)) as client:
        assert notify.deliver_photo(b"\xff\xd8jpg", "c", client=client) is False
    assert all("token" not in r["detail"] for r in notify.recent())


def test_blurred_frame_hides_people_and_unverified_seats_but_not_verified_empty_ones():
    zones = video_sim.parse_zones(REF_SEATS)
    bgr = cabin(w=640, h=360)
    data = alert_card.blurred_frame(bgr, [], zones, {"rear_right": {"state": "SEAT_CHANGED"}, "rear_left": {"state": "EMPTY_VERIFIED"}})
    out = np.asarray(Image.open(io.BytesIO(data)).convert("L")).astype(float)
    src = np.asarray(Image.fromarray(bgr[:, :, ::-1]).convert("L")).astype(float)

    def detail(a, box):   # high-frequency energy inside a normalised box
        x1, y1, x2, y2 = (int(box[0] * 640), int(box[1] * 360), int(box[2] * 640), int(box[3] * 360))
        r = a[y1:y2 - 30, x1:x2]
        return float(np.abs(np.diff(r, axis=1)).mean())
    assert detail(out, REF_SEATS[0]["box"]) < 0.5 * detail(src, REF_SEATS[0]["box"])     # rear_right: pixelated
    assert detail(out, REF_SEATS[1]["box"]) > 0.7 * detail(src, REF_SEATS[1]["box"])     # rear_left verified empty: kept


def test_alert_photo_is_off_by_default_needs_consent_and_goes_once_per_incident(env, studio, monkeypatch):  # noqa: F811
    _, provider = studio
    admin = make_admin(env)
    sent = []
    monkeypatch.setattr(notify, "channels", lambda: {"ntfy": False, "telegram": True})
    monkeypatch.setattr(notify, "deliver_photo_async", lambda jpeg, caption: sent.append((jpeg, caption)) or True)
    url = f"/api/v1/admin/demo/alert-photo/{VEHICLE}"
    assert env.client.get(url, headers=auth(admin)).json()["enabled"] is False
    assert env.client.put(url, json={"enabled": True}, headers=auth(admin)).status_code == 422
    env.client.post("/api/v1/admin/demo/video/start", json={"vehicle_id": VEHICLE, "zones": REF_SEATS}, headers=auth(admin))

    def frame(seq):
        env.clock[0] += timedelta(milliseconds=400)
        return env.client.post("/api/v1/admin/demo/video/frame", data={"vehicle_id": VEHICLE, "sequence": str(seq)},
                               files={"image": ("f.jpg", jpg(cabin(w=64, h=48)), "image/jpeg")}, headers=auth(admin)).json()

    provider.next = [person(40, 25, 55, 45)]
    assert frame(1)["alert_photo"] is None and not sent                                   # off: nothing leaves
    assert env.client.put(url, json={"enabled": True, "consent": True}, headers=auth(admin)).json()["enabled"] is True
    assert frame(2)["alert_photo"] == "queued" and len(sent) == 1
    assert sent[0][0][:2] == b"\xff\xd8" and "làm mờ" in sent[0][1]
    frame(3)
    assert len(sent) == 1                                                                 # once per incident
    assert any(r["action"] == "vehicle.alert_photo" for r in env.store._all("SELECT action FROM audit_log"))
