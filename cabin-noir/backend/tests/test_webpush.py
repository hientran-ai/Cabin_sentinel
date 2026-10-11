"""Web Push: browsers get alerts with the tab closed; only real push services are called; dead subscriptions go away."""
import base64
import json

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec

from app import alerts, db, main, webpush
from tests.test_api import env  # noqa: F401
from tests.test_production import frame, login, prod, setup_car  # noqa: F401

PERSON = frame(detections=[{"seat": "rear_right", "kind": "person", "conf": 0.9, "age": "child"}])


def browser_keys():
    """A real P-256 key pair and auth secret, as a browser would make them."""
    k = ec.generate_private_key(ec.SECP256R1())
    raw = k.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    b = lambda x: base64.urlsafe_b64encode(x).decode().rstrip("=")  # noqa: E731
    return b(raw), b(b"0123456789abcdef")


def sub(c, h, endpoint="https://fcm.googleapis.com/fcm/send/abc123"):
    p256dh, auth = browser_keys()
    return c.post("/v1/me/webpush", json={"endpoint": endpoint, "p256dh": p256dh, "auth": auth}, headers=h)


def test_subscribe_only_to_real_push_services_and_with_valid_keys(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    key = c.get("/v1/webpush/key").json()["public_key"]
    assert len(base64.urlsafe_b64decode(key + "=")) == 65                                  # raw P-256 point for PushManager
    assert c.get("/v1/webpush/key").json()["public_key"] == key                             # made once, then kept
    assert sub(c, h).status_code == 200
    for bad in ("http://fcm.googleapis.com/x", "https://evil.example/x", "https://127.0.0.1/x", "https://fcm.googleapis.com.evil.com/x"):
        assert sub(c, h, bad).status_code == 422, bad
    assert c.post("/v1/me/webpush", json={"endpoint": "https://fcm.googleapis.com/x", "p256dh": "AAAA", "auth": "BB"}, headers=h).status_code == 422
    assert sub(c, {"Authorization": "Bearer nope"}).status_code == 401
    assert c.get("/v1/me/webpush", headers=h).json()["browsers"] == 1
    assert c.request("DELETE", "/v1/me/webpush", json={"endpoint": "https://fcm.googleapis.com/fcm/send/abc123"}, headers=h).json()["removed"] == 1


def test_an_alert_reaches_the_browser_and_a_dead_one_is_dropped(prod):
    c, clock, sent, _ = prod
    calls = []
    webpush.set_sender(lambda s, payload, ttl, urgency: calls.append((s["endpoint"], json.loads(payload), urgency)) or
                       (410 if "gone" in s["endpoint"] else 201))
    try:
        h, uid, vid, dh, _ = setup_car(c, sent)
        sub(c, h, "https://fcm.googleapis.com/fcm/send/live")
        sub(c, h, "https://updates.push.services.mozilla.com/wpush/v2/gone")
        c.post("/v1/device/telemetry", json=PERSON, headers=dh)
        alerts.run_once(main.refresh)
        first = [p for e, p, u in calls if e.endswith("/live")][0]
        inc = c.get(f"/v1/vehicles/{vid}/history", headers=h).json()["incidents"][0]
        assert first["urgent"] and first["url"] == f"./#/incident/{inc['id']}" and "người trong xe" in first["title"]
        assert any(u == "high" for _, _, u in calls)
        assert any(t["topic"].startswith("cs-") for t in sent)                              # ntfy still got it: web push is extra
        rows = [r["endpoint"] for r in db.all_("SELECT endpoint FROM web_push WHERE user_id=?", uid)]
        assert rows == ["https://fcm.googleapis.com/fcm/send/live"]                          # 410: removed
        assert c.post("/v1/me/webpush/test", headers=h).status_code == 200
    finally:
        webpush.set_sender(None)


def test_logout_everywhere_and_account_deletion_remove_subscriptions(prod):
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    sub(c, h)
    c.post("/v1/auth/logout-all", headers=h)
    assert db.one("SELECT COUNT(*) AS n FROM web_push WHERE user_id=?", uid)["n"] == 0
    h, uid = login(c, sent, phone="0903000111")
    sub(c, h)
    c.request("DELETE", "/v1/me", json={"confirm": "XOA TAI KHOAN"}, headers=h)
    assert db.one("SELECT COUNT(*) AS n FROM web_push WHERE user_id=?", uid)["n"] == 0


def test_the_real_library_encrypts_and_signs(prod, monkeypatch):
    """Runs pywebpush itself with our stored key; only the network call is replaced."""
    c, clock, sent, _ = prod
    h, uid = login(c, sent)
    sub(c, h)
    seen = {}

    class Resp:
        status_code = 201
        text = ""

    def fake_post(url, data=None, headers=None, timeout=None, **kw):
        seen.update(url=url, headers=headers, size=len(data))
        return Resp()

    import requests
    monkeypatch.setattr(requests, "post", fake_post)
    assert webpush.notify_user(uid, "Thử", "Nội dung", urgent=True)
    assert seen["url"].startswith("https://fcm.googleapis.com/")
    assert seen["headers"]["content-encoding"] == "aes128gcm" and seen["headers"]["Urgency"] == "high"
    assert seen["headers"]["authorization"].startswith("vapid t=")
    assert seen["size"] > 100
