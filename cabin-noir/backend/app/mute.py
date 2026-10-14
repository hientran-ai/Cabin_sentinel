"""Mute: a person can silence their own alerts for a while (5 minutes to 4 hours) from the app or with /tamdung in Telegram,
or, from the app after a warning, until they turn them back on.

It is per person. A timed mute ends by itself with a message saying alerts are back; an open-ended one never ends by itself
and reminds the person every few hours that they are not getting alerts. Incidents are still recorded and shown in the app
while muted, and other family members still get alerts; the mute only stops pushes (Telegram, ntfy, browser) to that person.
"""
from __future__ import annotations

from typing import Any

from . import db
from .logic import PAUSE_FOREVER, now

MIN_MINUTES, MAX_MINUTES, DEFAULT_MINUTES = 5, 240, 60
REMINDER_S = 6 * 3600              # an open-ended mute reminds the person this often


def _settings(user_id: str) -> dict[str, Any]:
    row = db.one("SELECT settings FROM users WHERE id=?", user_id)
    return db.loads(row["settings"]) if row else {}


def until(user_id: str) -> float:
    """When the mute ends, or 0 if the user is not muted."""
    t = float(_settings(user_id).get("mute_until") or 0)
    return t if t > now() else 0.0


def active(user_id: str) -> bool:
    return until(user_id) > 0


def indefinite(user_id: str) -> bool:
    """Muted until the person turns alerts back on (no end time)."""
    return bool(_settings(user_id).get("mute_indefinite")) and active(user_id)


def _write(user_id: str, value: float, forever: bool = False) -> None:
    cur = _settings(user_id)
    cur["mute_until"], cur["mute_indefinite"] = value, forever
    cur["mute_reminded_at"] = now() if forever else 0
    with db.tx() as conn:
        conn.execute("UPDATE users SET settings=? WHERE id=?", (db.dumps(cur), user_id))


def start(user_id: str, minutes: int | None, until_resumed: bool = False) -> float:
    if until_resumed:
        _write(user_id, PAUSE_FOREVER, forever=True)
        return PAUSE_FOREVER
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


def reminders_due() -> list[str]:
    """People muted until they turn alerts back on whose last reminder is REMINDER_S old. Marks them reminded."""
    out = []
    for r in db.all_("SELECT id, settings FROM users WHERE settings LIKE '%mute_indefinite%'"):
        st = db.loads(r["settings"])
        if st.get("mute_indefinite") and float(st.get("mute_until") or 0) > now() and now() - float(st.get("mute_reminded_at") or 0) >= REMINDER_S:
            st["mute_reminded_at"] = now()
            with db.tx() as conn:
                conn.execute("UPDATE users SET settings=? WHERE id=?", (db.dumps(st), r["id"]))
            out.append(r["id"])
    return out
