"""Real alert channels: ntfy and Telegram. Both are optional and off unless configured.

These are foreign services, so a message carries only what a bystander could act on: the risk level, the vehicle id and
the rule. It never carries an owner name, phone number, plate or address. On Telegram the alert is a card drawn from that
same data (alert_card.py), not a camera image. A camera photo goes out only when an administrator turned alert photos on
for that demo vehicle with consent, and only after every person and every seat not verified empty was pixelated. Delivery is fire-and-forget on a
worker thread so a slow channel cannot hold up the safety loop; every attempt is recorded in a bounded in-memory log
(no secrets) that the demo studio and the system page can show. Tokens are never logged or returned.
"""

from __future__ import annotations

import logging
import threading
from collections import deque
from datetime import UTC, datetime
from urllib.parse import urlparse

import httpx

from src.config import get_settings

logger = logging.getLogger(__name__)
TIMEOUT_S = 5.0
_log: deque[dict] = deque(maxlen=30)
_lock = threading.Lock()


def _ntfy_target(settings) -> tuple[str, str] | None:
    """(server url, topic) when ntfy is configured. Plain http only for localhost (tests, a self-hosted dev box)."""
    topic = (settings.ntfy_topic or "").strip()
    server = (settings.ntfy_server or "").strip().rstrip("/")
    if not topic or not server:
        return None
    parsed = urlparse(server)
    local = parsed.hostname in {"localhost", "127.0.0.1"}
    if parsed.scheme != "https" and not (parsed.scheme == "http" and local):
        return None
    return server, topic


def _telegram_ready(settings) -> bool:
    return bool(settings.telegram_bot_token.get_secret_value() and settings.telegram_chat_id)


def channels() -> dict:
    """Which channels are configured. The ntfy topic is the 'password' of that channel, so it is not exposed."""
    settings = get_settings()
    return {"ntfy": _ntfy_target(settings) is not None, "telegram": _telegram_ready(settings)}


def configured() -> bool:
    return any(channels().values())


def recent() -> list[dict]:
    with _lock:
        return list(_log)


def _record(channel: str, ok: bool, detail: str) -> None:
    with _lock:
        _log.appendleft({"at": datetime.now(UTC).isoformat(), "channel": channel, "ok": ok, "detail": detail})


def deliver(title: str, body: str, *, urgent: bool = False, client: httpx.Client | None = None,
            card: bytes | None = None) -> list[dict]:
    """Send now (blocking, bounded by the timeout). Returns one result per configured channel; never raises."""
    settings = get_settings()
    results = []
    owns = client is None
    client = client or httpx.Client(timeout=TIMEOUT_S, follow_redirects=False)
    try:
        target = _ntfy_target(settings)
        if target:
            try:
                # JSON publish keeps Vietnamese text intact (header values must be ASCII).
                r = client.post(target[0], json={"topic": target[1], "title": title, "message": body,
                                                 "priority": 5 if urgent else 3, "tags": ["rotating_light" if urgent else "bell"]})
                ok, detail = r.is_success, f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                ok, detail = False, type(exc).__name__
            _record("ntfy", ok, detail)
            results.append({"channel": "ntfy", "ok": ok})
        if _telegram_ready(settings):
            token = settings.telegram_bot_token.get_secret_value()
            try:
                if card:
                    r = client.post(f"https://api.telegram.org/bot{token}/sendPhoto",
                                    data={"chat_id": settings.telegram_chat_id, "caption": f"{title}\n{body}"[:1000],
                                          "disable_notification": str(not urgent).lower()},
                                    files={"photo": ("canh-bao.png", card, "image/png")})
                else:
                    r = client.post(f"https://api.telegram.org/bot{token}/sendMessage",
                                    json={"chat_id": settings.telegram_chat_id, "text": f"{title}\n{body}",
                                          "disable_notification": not urgent})
                ok, detail = r.is_success, f"HTTP {r.status_code}"
            except httpx.HTTPError as exc:
                ok, detail = False, type(exc).__name__  # the exception text can contain the URL (and so the token)
            _record("telegram", ok, detail)
            results.append({"channel": "telegram", "ok": ok})
    finally:
        if owns:
            client.close()
    return results


def deliver_async(title: str, body: str, *, urgent: bool = False, card_for=None) -> bool:
    """Queue a delivery on a daemon thread. False if nothing is configured. ``card_for`` builds the card on that thread."""
    if not configured():
        return False

    def run() -> None:
        card = None
        if card_for is not None and _telegram_ready(get_settings()):
            try:
                card = card_for()
            except Exception:  # a card that cannot be drawn must never cost the alert
                logger.warning("Alert card could not be drawn; sending text only")
        deliver(title, body, urgent=urgent, card=card)
    threading.Thread(target=run, daemon=True, name="notify").start()
    return True

