"""One-time sign-in codes: hashing and storage, shared by the HTTP endpoint and the Telegram bot."""
from __future__ import annotations

import hashlib
import hmac
import secrets

from . import config, db
from .logic import now

TTL_S = 300


def code_hash(phone: str, code: str) -> str:
    """One-time codes have only 10^6 values, so they are hashed with a server key (HMAC) and bound to the phone."""
    return hmac.new(config.SECRET.encode(), f"{phone}:{code}".encode(), hashlib.sha256).hexdigest()


def issue(phone: str) -> str:
    """Create (replacing any older one) a code for this phone and return it. Only the hash is stored."""
    code = f"{secrets.randbelow(1_000_000):06d}"
    with db.tx() as conn:
        conn.execute("INSERT INTO otps(phone,code_hash,expires_at,attempts) VALUES(?,?,?,0) "
                     "ON CONFLICT(phone) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at, attempts=0",
                     (phone, code_hash(phone, code), now() + TTL_S))
    return code
