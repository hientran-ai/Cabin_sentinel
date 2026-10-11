"""Push delivery over ntfy (https://docs.ntfy.sh/publish/#publish-as-json). One private random topic per user."""
from __future__ import annotations

import json
import secrets
import urllib.request
from typing import Any, Callable, Sequence

from . import config, db, telegram

Sender = Callable[[str, str, str, int, Sequence[str], str | None], bool]


def _send(topic: str, title: str, message: str, priority: int, tags: Sequence[str], click: str | None) -> bool:
    body: dict[str, Any] = {"topic": topic, "title": title, "message": message, "priority": priority, "tags": list(tags)}
    if click:
        body["click"] = click
    req = urllib.request.Request(config.NTFY_URL, data=json.dumps(body).encode(), method="POST",
                                 headers={"Content-Type": "application/json"})
    if config.NTFY_TOKEN:
        req.add_header("Authorization", f"Bearer {config.NTFY_TOKEN}")
    try:
        with urllib.request.urlopen(req, timeout=6) as r:
            return 200 <= r.status < 300
    except Exception:
        return False


_sender: Sender = _send


def set_sender(fn: Sender | None) -> None:
    """Tests replace the network call."""
    global _sender
    _sender = fn or _send


def publish(topic: str, title: str, message: str, priority: int = 3, tags: Sequence[str] = (), click: str | None = None) -> bool:
    return _sender(topic, title, message, priority, tags, click)


def topic_for(user_id: str) -> str:
    row = db.one("SELECT topic FROM push_topics WHERE user_id=?", user_id)
    if row:
        return row["topic"]
    topic = "cs-" + secrets.token_urlsafe(18)
    with db.tx() as conn:
        conn.execute("INSERT OR IGNORE INTO push_topics(user_id,topic) VALUES(?,?)", (user_id, topic))
    return db.one("SELECT topic FROM push_topics WHERE user_id=?", user_id)["topic"]


def _channel(user_id: str) -> str:
    row = db.one("SELECT settings FROM users WHERE id=?", user_id)
    return (db.loads(row["settings"]) if row else {}).get("notify_channel", "auto")


def notify_user(user_id: str, title: str, message: str, urgent: bool = False, tags: Sequence[str] = (), click: str | None = None) -> bool:
    """Send through the user's channel: Telegram when linked ("auto"), ntfy otherwise. A failed Telegram send falls back to ntfy
    so an alert is never lost because one channel is down."""
    channel = _channel(user_id)
    chat = telegram.chat_for(user_id) if config.telegram_configured() else None
    use_tg = bool(chat) and channel in ("auto", "telegram", "both")
    ok = False
    if use_tg:
        ok = telegram.notify(chat, title, message, urgent, click or (config.WEB_BASE_URL or None))
    if channel in ("ntfy", "both") or not use_tg or not ok:
        ok = publish(topic_for(user_id), title, message, priority=5 if urgent else 3,
                     tags=tags or (["rotating_light"] if urgent else ["warning"]), click=click) or ok
    return ok
