"""Telegram alert card: drawn from data, never a camera frame."""

import io

import httpx
from PIL import Image

from src.cabinsentinel import alert_card, notify


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

    assert all("token" not in r["detail"] for r in notify.recent())
