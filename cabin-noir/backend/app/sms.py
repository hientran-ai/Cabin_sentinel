"""SMS through the Twilio REST API (no SDK). Returns (ok, detail); never raises."""
from __future__ import annotations

import base64
import urllib.parse
import urllib.request
from typing import Callable

from . import config

Sender = Callable[[str, str], tuple[bool, str]]


def to_e164(phone: str) -> str:
    p = phone.replace(" ", "")
    return "+84" + p[1:] if p.startswith("0") else p


def _send(to: str, body: str) -> tuple[bool, str]:
    if not config.sms_configured():
        return False, "not_configured"
    url = f"https://api.twilio.com/2010-04-01/Accounts/{config.TWILIO_SID}/Messages.json"
    data = urllib.parse.urlencode({"To": to_e164(to), "From": config.TWILIO_FROM, "Body": body}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    req.add_header("Authorization", "Basic " + base64.b64encode(f"{config.TWILIO_SID}:{config.TWILIO_TOKEN}".encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return (200 <= r.status < 300), f"http_{r.status}"
    except Exception as e:
        return False, type(e).__name__


_sender: Sender = _send


def set_sender(fn: Sender | None) -> None:
    global _sender
    _sender = fn or _send


def send(to: str, body: str) -> tuple[bool, str]:
    return _sender(to, body)
