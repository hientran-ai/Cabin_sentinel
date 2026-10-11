"""Telegram channel: one-time link, private chats only, routing with ntfy fallback, and honest content."""
import pytest

from app import alerts, config, logic, main, push, telegram
from tests.test_api import env  # noqa: F401  (fixture used by prod)
from tests.test_production import frame, login, prod, setup_car  # noqa: F401  (fixtures and helpers)


@pytest.fixture()
def tg(prod, monkeypatch):  # noqa: F811
    c, clock, sent, texts = prod
    monkeypatch.setattr(config, "TELEGRAM_BOT_TOKEN", "123:abc")
    monkeypatch.setattr(config, "TELEGRAM_BOT_USERNAME", "cabin_noir_bot")
    monkeypatch.setattr(config, "WEB_BASE_URL", "https://cabin.example/app")
    tsent: list[dict] = []
    telegram.set_sender(lambda chat, text, click, markup=None: tsent.append({"chat": chat, "text": text, "click": click}) or True)
    yield c, clock, sent, tsent
    telegram.set_sender(None)


def update(chat_id, text, kind="private"):
    return {"update_id": 1, "message": {"chat": {"id": chat_id, "type": kind}, "text": text}}


def link(c, h, tsent, chat=777):
    r = c.post("/v1/me/telegram/link", headers=h).json()
    assert r["deep_link"] == f"https://t.me/cabin_noir_bot?start={r['code']}"
    telegram.handle_update(update(chat, f"/start {r['code']}"))
    return r["code"]


def test_link_needs_the_one_time_code_and_private_chat(tg):
    c, clock, sent, tsent = tg
    h, uid = login(c, sent)
    assert c.get("/v1/me/telegram", headers=h).json() == {"configured": True, "linked": False, "bot": "cabin_noir_bot"}
    code = c.post("/v1/me/telegram/link", headers=h).json()["code"]
    telegram.handle_update(update(5, f"/start {code}", kind="group"))              # groups are ignored
    assert telegram.chat_for(uid) is None and not tsent
    telegram.handle_update(update(5, "/start WRONGCODE1"))
    assert telegram.chat_for(uid) is None and "không đúng" in tsent[-1]["text"]
    telegram.handle_update(update(5, f"/start {code}"))
    assert telegram.chat_for(uid) == "5"
    telegram.handle_update(update(6, f"/start {code}"))                              # the code is single use
    assert telegram.chat_for(uid) == "5"
    code2 = c.post("/v1/me/telegram/link", headers=h).json()["code"]
    clock.t += telegram.CODE_TTL_S + 1
    telegram.handle_update(update(8, f"/start {code2}"))                             # expired
    assert telegram.chat_for(uid) == "5"
    telegram.handle_update(update(5, "/stop"))
    assert telegram.chat_for(uid) is None


def test_alert_goes_to_telegram_when_linked_and_ntfy_otherwise(tg):
    c, clock, sent, tsent = tg
    h, uid, vid, dh, _ = setup_car(c, sent)
    det = frame(detections=[{"seat": "rear_left", "kind": "person", "conf": 0.9}])
    c.post("/v1/device/telemetry", json=det, headers=dh)
    sent.clear()
    alerts.run_once(main.refresh)
    assert any("có thể có người" in m["title"] for m in sent) and not tsent          # not linked yet: ntfy as before
    link(c, h, tsent)
    tsent.clear(); sent.clear()
    clock.t += 70
    c.post("/v1/device/telemetry", json=det, headers=dh)
    alerts.run_once(main.refresh)
    assert tsent and tsent[0]["chat"] == "777" and tsent[0]["click"] == "https://cabin.example/app"
    assert "gọi 112" in tsent[0]["text"] and "không điều khiển xe" in tsent[0]["text"]
    assert not any(m["topic"].startswith("cs-") for m in sent)                       # replaced, not duplicated


def test_channel_setting_and_fallback(tg):
    c, clock, sent, tsent = tg
    h, uid = login(c, sent)
    link(c, h, tsent)
    sent.clear(); tsent.clear()
    assert push.notify_user(uid, "T", "M", urgent=True) and tsent and not sent       # auto: Telegram only
    c.put("/v1/me/settings", json={"notify_channel": "both"}, headers=h)
    tsent.clear()
    push.notify_user(uid, "T", "M")
    assert tsent and sent                                                           # both
    c.put("/v1/me/settings", json={"notify_channel": "ntfy"}, headers=h)
    tsent.clear(); sent.clear()
    push.notify_user(uid, "T", "M")
    assert not tsent and sent
    c.put("/v1/me/settings", json={"notify_channel": "auto"}, headers=h)
    telegram.set_sender(lambda chat, text, click, markup=None: False)                            # Telegram is down
    sent.clear()
    assert push.notify_user(uid, "T", "M", urgent=True) and sent                    # an alert is never lost


def test_test_message_and_unlink(tg):
    c, clock, sent, tsent = tg
    h, uid = login(c, sent)
    assert c.post("/v1/me/telegram/test", headers=h).status_code == 409
    link(c, h, tsent)
    assert c.post("/v1/me/telegram/test", headers=h).json() == {"sent": True}
    assert c.delete("/v1/me/telegram", headers=h).json() == {"ok": True}
    assert c.get("/v1/me/telegram", headers=h).json()["linked"] is False


def test_webhook_needs_the_secret(tg, monkeypatch):
    c, clock, sent, tsent = tg
    h, uid = login(c, sent)
    code = c.post("/v1/me/telegram/link", headers=h).json()["code"]
    assert c.post("/v1/telegram/webhook/nope", json=update(9, f"/start {code}")).status_code == 404
    monkeypatch.setattr(config, "TELEGRAM_WEBHOOK_SECRET", "s3cret")
    assert c.post("/v1/telegram/webhook/wrong", json=update(9, f"/start {code}")).status_code == 404
    assert c.post("/v1/telegram/webhook/s3cret", json=update(9, f"/start {code}")).status_code == 200
    assert telegram.chat_for(uid) == "9"


def contact(chat, phone, uid=None, from_id=None):
    return {"update_id": 1, "message": {"chat": {"id": chat, "type": "private"}, "from": {"id": from_id or chat},
                                         "contact": {"phone_number": phone, "user_id": uid or chat}}}


def test_login_by_bot_proves_phone_with_own_contact_and_links_chat(tg):
    c, clock, sent, tsent = tg
    phone = "0373757653"
    r = c.post("/v1/auth/otp", json={"phone": phone}).json()
    link_ = r["telegram"]["deep_link"]
    assert link_.startswith("https://t.me/cabin_noir_bot?start=login_") and "dev_code" not in r
    nonce = link_.split("start=login_")[1]
    telegram.handle_update(update(41, "/start login_WRONG"))
    assert "không đúng" in tsent[-1]["text"]
    telegram.handle_update(update(41, f"/start login_{nonce}"))
    assert "chia sẻ số điện thoại" in tsent[-1]["text"]
    telegram.handle_update(contact(41, "+84999999999"))                                  # another phone
    assert "khác" in tsent[-1]["text"]
    telegram.handle_update(contact(41, "+84 373 757 653", uid=999))                      # forwarded contact of someone else
    assert "của chính bạn" in tsent[-1]["text"]
    telegram.handle_update(contact(41, "+84373757653"))
    code = tsent[-1]["text"].split("Mã đăng nhập Cabin Noir: ")[1][:6]
    v = c.post("/v1/auth/verify", json={"phone": phone, "code": code, "name": "An"}).json()
    h = {"Authorization": "Bearer " + v["token"]}
    assert telegram.chat_for(v["user"]["id"]) == "41"                                    # signing in also linked the alert channel
    assert c.get("/v1/me/telegram", headers=h).json()["linked"] is True
    # next login: the code arrives in Telegram straight away
    n = len(tsent)
    c.post("/v1/auth/otp", json={"phone": phone})
    assert len(tsent) == n + 1 and tsent[-1]["chat"] == "41" and "Mã đăng nhập" in tsent[-1]["text"]


def test_login_link_is_single_chat_and_expires(tg):
    c, clock, sent, tsent = tg
    r = c.post("/v1/auth/otp", json={"phone": "0912345678"}).json()
    nonce = r["telegram"]["deep_link"].split("login_")[1]
    telegram.handle_update(update(51, f"/start login_{nonce}"))
    telegram.handle_update(update(52, f"/start login_{nonce}"))                          # a second chat cannot take it over
    assert "không đúng" in tsent[-1]["text"]
    clock.t += telegram.LOGIN_TTL_S + 1
    telegram.handle_update(contact(51, "0912345678"))
    assert "Không có phiên" in tsent[-1]["text"]


def test_otp_answer_does_not_reveal_whether_phone_is_known(tg):
    c, clock, sent, tsent = tg
    h, uid = login(c, sent)
    phone = c.get("/v1/me", headers=h).json()["phone"] if c.get("/v1/me", headers=h).status_code == 200 else None
    a = c.post("/v1/auth/otp", json={"phone": "0900000001"}).json()
    b = c.post("/v1/auth/otp", json={"phone": phone or "0900000002"}).json()
    assert set(a) == set(b)
