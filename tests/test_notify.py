"""Real alert channels: configured on demand, carry no personal data, never leak the Telegram token."""

import httpx

from src.cabinsentinel import actions, notify
from src.config import get_settings


def configure(monkeypatch, **values):
    settings = get_settings()
    for key, value in values.items():
        monkeypatch.setattr(settings, key, value)


def test_nothing_is_sent_unless_a_channel_is_configured(monkeypatch):
    configure(monkeypatch, ntfy_topic="", telegram_chat_id="")
    assert not notify.configured()
    assert isinstance(actions.build_actions(), actions.MockActions) and not isinstance(actions.build_actions(), actions.ChannelActions)
    assert actions.MockActions().execute("send_notification", "X")["status"] == "simulated"


def test_ntfy_and_telegram_messages_and_secret_handling(monkeypatch):
    from pydantic import SecretStr
    configure(monkeypatch, ntfy_server="https://ntfy.example", ntfy_topic="cs-test-topic",
              telegram_bot_token=SecretStr("123:SECRET-TOKEN"), telegram_chat_id="42")
    seen = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200)

    results = notify.deliver("CabinSentinel: có người trong xe", "Xe VF8-DEMO-01: kiểm tra ngay.", urgent=True,
                             client=httpx.Client(transport=httpx.MockTransport(handler)))
    assert [r["ok"] for r in results] == [True, True]
    assert str(seen[0].url) == "https://ntfy.example/cs-test-topic" and seen[0].headers["Priority"] == "urgent"
    assert seen[0].headers["Title"].isascii()
    assert "api.telegram.org/bot123:SECRET-TOKEN/sendMessage" in str(seen[1].url)
    assert "SECRET" not in repr(notify.recent()) and "SECRET" not in repr(notify.channels())
    assert notify.channels() == {"ntfy": True, "telegram": True}


def test_a_failing_channel_is_reported_not_raised_and_never_exposes_the_token(monkeypatch):
    from pydantic import SecretStr
    configure(monkeypatch, ntfy_topic="", telegram_bot_token=SecretStr("9:LEAKME"), telegram_chat_id="1")

    def boom(request):
        raise httpx.ConnectError("could not reach https://api.telegram.org/bot9:LEAKME/sendMessage")

    results = notify.deliver("t", "b", client=httpx.Client(transport=httpx.MockTransport(boom)))
    assert results == [{"channel": "telegram", "ok": False}]
    assert "LEAKME" not in repr(notify.recent())


def test_plain_http_ntfy_is_refused_except_on_localhost(monkeypatch):
    configure(monkeypatch, ntfy_server="http://ntfy.example", ntfy_topic="t")
    assert notify.channels()["ntfy"] is False
    configure(monkeypatch, ntfy_server="http://127.0.0.1:8090", ntfy_topic="t")
    assert notify.channels()["ntfy"] is True


def test_notification_tool_dispatches_and_sms_stays_honest(monkeypatch):
    configure(monkeypatch, ntfy_server="https://ntfy.example", ntfy_topic="t")
    sent = []
    monkeypatch.setattr(notify, "deliver_async", lambda title, body, urgent=False: sent.append((title, body)) or True)
    channel = actions.build_actions()
    assert isinstance(channel, actions.ChannelActions)
    n = channel.execute("send_notification", "VF8-DEMO-01")
    assert n["status"] == "dispatched" and n["parameters"]["channels"] == ["ntfy"]
    s = channel.execute("send_sms", "VF8-DEMO-01")
    assert s["status"] == "simulated" and "SMS gateway chưa nối" in s["note"]
    assert channel.execute("trigger_horn", "VF8-DEMO-01")["status"] == "simulated"
    assert all("DEMO-801" not in body and "@" not in body for _, body in sent)  # no plate, no contact data
