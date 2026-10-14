"""Temporary mute: a person can silence their own alerts for a while (5 minutes to 4 hours) from the app or with /tamdung in Telegram.

It is per person, never silent forever, and always ends by itself with a message saying alerts are back. Incidents are still
recorded and shown in the app while muted; the mute only stops pushes (Telegram, ntfy, browser) to that person.
"""
from __future__ import annotations

from typing import Any

from . import db
from .logic import now

MIN_MINUTES, MAX_MINUTES, DEFAULT_MINUTES = 5, 240, 60


def _settings(user_id: str) -> dict[str, Any]:
    row = db.one("SELECT settings FROM users WHERE id=?", user_id)
    return db.loads(row["settings"]) if row else {}


def until(user_id: str) -> float:
    """When the mute ends, or 0 if the user is not muted."""
    t = float(_settings(user_id).get("mute_until") or 0)
    return t if t > now() else 0.0


def active(user_id: str) -> bool:
    return until(user_id) > 0


def _write(user_id: str, value: float) -> None:
    cur = _settings(user_id)
    cur["mute_until"] = value
    with db.tx() as conn:
        conn.execute("UPDATE users SET settings=? WHERE id=?", (db.dumps(cur), user_id))


def start(user_id: str, minutes: int | None) -> float:
    m = DEFAULT_MINUTES if minutes is None else max(MIN_MINUTES, min(MAX_MINUTES, int(minutes)))
    end = now() + m * 60
    _write(user_id, end)
    return end


def stop(user_id: str) -> None:
    _write(user_id, 0)


def expired() -> list[str]:
    """Users whose mute has run out and who have not been told alerts are back yet."""
    out = []
    for r in db.all_("SELECT id, settings FROM users WHERE settings LIKE '%mute_until%'"):
        t = float(db.loads(r["settings"]).get("mute_until") or 0)
        if 0 < t <= now():
            out.append(r["id"])
    return out
