"""Web Push (RFC 8030/8291/8292): alerts reach a browser even when the Cabin Noir tab is closed, like a phone notification.

The payload is encrypted for that browser, so the push service (Google, Mozilla, Apple, Microsoft) cannot read it. It still
carries only what the notification shows: a title, one line, and the page to open. Subscriptions belong to a user, are removed
with the account, when the browser says they are gone (404/410), and after 90 days without a successful delivery.
"""
from __future__ import annotations

import base64
import json
import re
from typing import Any, Callable
from urllib.parse import urlparse

from . import config, db
from .logic import now

# The server only ever posts to these push services, never to an address a client made up (no server-side request forgery).
PUSH_HOSTS = re.compile(
    r"^(fcm\.googleapis\.com|android\.googleapis\.com|updates\.push\.services\.mozilla\.com|[a-z0-9.-]+\.push\.apple\.com|"
    r"[a-z0-9-]+\.notify\.windows\.com)$")
MAX_PER_USER = 10
STALE_S = 90 * 86400

Sender = Callable[[dict[str, Any], str, int, str], int]   # (subscription, payload json, ttl, urgency) -> HTTP status


def valid_endpoint(endpoint: str) -> bool:
    try:
        u = urlparse(endpoint)
    except ValueError:
        return False
    return u.scheme == "https" and bool(u.hostname) and bool(PUSH_HOSTS.match(u.hostname)) and len(endpoint) <= 1024


def _b64url_ok(s: str, min_len: int) -> bool:
    try:
        return len(base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))) >= min_len
    except Exception:
        return False


def valid_keys(p256dh: str, auth: str) -> bool:
    return _b64url_ok(p256dh, 65) and _b64url_ok(auth, 16) and len(p256dh) < 200 and len(auth) < 100


# ---------------------------------------------------------------- server key

def _private_pem() -> str:
    """The VAPID key pair identifies this server to push services. Made once and kept in the database (file mode 0600)."""
    if config.WEBPUSH_VAPID_PRIVATE:
        return config.WEBPUSH_VAPID_PRIVATE
    row = db.one("SELECT value FROM server_keys WHERE name='vapid_private'")
    if row:
        return row["value"]
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec
    pem = ec.generate_private_key(ec.SECP256R1()).private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()).decode()
    with db.tx() as conn:
        conn.execute("INSERT OR IGNORE INTO server_keys(name,value) VALUES('vapid_private',?)", (pem,))
    return db.one("SELECT value FROM server_keys WHERE name='vapid_private'")["value"]


def public_key() -> str:
    """Application server key for PushManager.subscribe(): the raw uncompressed P-256 point, base64url without padding."""
    from cryptography.hazmat.primitives import serialization
    key = serialization.load_pem_private_key(_private_pem().encode(), password=None)
    raw = key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


# ---------------------------------------------------------------- subscriptions

def subscribe(user_id: str, endpoint: str, p256dh: str, auth: str, agent: str) -> None:
    t = now()
    with db.tx() as conn:
        conn.execute("INSERT INTO web_push(endpoint,user_id,p256dh,auth,agent,created_at,last_ok_at) VALUES(?,?,?,?,?,?,NULL) "
                     "ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, "
                     "agent=excluded.agent, created_at=excluded.created_at",
                     (endpoint, user_id, p256dh, auth, agent[:120], t))
        # Keep the newest few per user: an old laptop does not need to receive alerts forever.
        conn.execute("DELETE FROM web_push WHERE user_id=? AND endpoint NOT IN "
                     "(SELECT endpoint FROM web_push WHERE user_id=? ORDER BY created_at DESC LIMIT ?)", (user_id, user_id, MAX_PER_USER))


def unsubscribe(user_id: str, endpoint: str | None = None) -> int:
    with db.tx() as conn:
        if endpoint:
            return conn.execute("DELETE FROM web_push WHERE user_id=? AND endpoint=?", (user_id, endpoint)).rowcount
        return conn.execute("DELETE FROM web_push WHERE user_id=?", (user_id,)).rowcount


def count(user_id: str) -> int:
    return db.one("SELECT COUNT(*) AS n FROM web_push WHERE user_id=?", user_id)["n"]


def purge(t: float) -> int:
    with db.tx() as conn:
        return conn.execute("DELETE FROM web_push WHERE COALESCE(last_ok_at, created_at) < ?", (t - STALE_S,)).rowcount


# ---------------------------------------------------------------- sending

def _send(sub: dict[str, Any], payload: str, ttl: int, urgency: str) -> int:
    from pywebpush import WebPushException, webpush
    host = urlparse(sub["endpoint"]).hostname or ""
    try:
        r = webpush(subscription_info={"endpoint": sub["endpoint"], "keys": {"p256dh": sub["p256dh"], "auth": sub["auth"]}},
                    data=payload, vapid_private_key=_private_pem_for_lib(), ttl=ttl,
                    vapid_claims={"sub": config.WEBPUSH_CONTACT, "aud": f"https://{host}"}, headers={"Urgency": urgency}, timeout=6)
        return getattr(r, "status_code", 201)
    except WebPushException as e:
        return getattr(getattr(e, "response", None), "status_code", 0) or 0
    except Exception:
        return 0


def _private_pem_for_lib() -> str:
    # pywebpush accepts the key as a PEM file path or as base64 DER; give it DER.
    from cryptography.hazmat.primitives import serialization
    key = serialization.load_pem_private_key(_private_pem().encode(), password=None)
    der = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    return base64.urlsafe_b64encode(der).decode().rstrip("=")


_sender: Sender = _send


def set_sender(fn: Sender | None) -> None:
    """Tests replace the network call."""
    global _sender
    _sender = fn or _send


def notify_user(user_id: str, title: str, message: str, urgent: bool = False, url: str | None = None, tag: str | None = None) -> bool:
    """Send to every browser this user turned notifications on in. True if at least one accepted it."""
    subs = [dict(r) for r in db.all_("SELECT endpoint,p256dh,auth FROM web_push WHERE user_id=?", user_id)]
    if not subs:
        return False
    payload = json.dumps({"title": title, "body": message[:240], "url": url or "./#/home", "tag": tag or "cabin-noir", "urgent": urgent},
                         ensure_ascii=False)
    ok = False
    for s in subs:
        status = _sender(s, payload, 600 if urgent else 3600, "high" if urgent else "normal")
        with db.tx() as conn:
            if 200 <= status < 300:
                ok = True
                conn.execute("UPDATE web_push SET last_ok_at=? WHERE endpoint=?", (now(), s["endpoint"]))
            elif status in (404, 410):          # the browser dropped this subscription
                conn.execute("DELETE FROM web_push WHERE endpoint=?", (s["endpoint"],))
    return ok
