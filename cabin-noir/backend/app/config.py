"""Runtime configuration, read once from the environment. See docs/PRODUCTION.md and backend/.env.example."""
from __future__ import annotations

import os
import secrets as _secrets

VERSION = "2.2.0"          # the release this code belongs to (the app and web show 2.2)
ENV = os.environ.get("CABIN_ENV", "development")
PRODUCTION = ENV == "production"
# DEV enables simulator routes, dev OTP echo and demo vehicles. Never on in production.
DEV = (not PRODUCTION) and os.environ.get("CABIN_DEV", "1") == "1"

# Browser clients (the web build of the app) on these origins may call the API. Auth is a bearer token, never a cookie.
CORS_ORIGINS = [o.strip() for o in os.environ.get(
    "CORS_ORIGINS", "https://cabinsentinel-mobile.pages.dev,http://localhost:8081,http://localhost:4599,http://localhost:19006"
).split(",") if o.strip()]
CORS_ORIGIN_REGEX = os.environ.get("CORS_ORIGIN_REGEX", r"https://[a-z0-9-]+\.cabinsentinel-mobile\.pages\.dev")

# Key for hashing one-time codes. Set CABIN_SECRET in production; without it a random key is used (codes are valid 5 minutes, so a restart only
# means asking for a new code).
SECRET = os.environ.get("CABIN_SECRET") or _secrets.token_hex(32)

# Abuse limits per client address (requests per minute). Behind a proxy the address comes from X-Forwarded-For (uvicorn --proxy-headers).
RATE_API_PER_MIN = int(os.environ.get("RATE_API_PER_MIN", "240"))
RATE_AUTH_PER_MIN = int(os.environ.get("RATE_AUTH_PER_MIN", "12"))
MAX_BODY_BYTES = 256 * 1024
MAX_PHOTO_BODY_BYTES = 7 * 1024 * 1024

TOKEN_TTL_S = int(os.environ.get("CABIN_TOKEN_TTL_DAYS", "90")) * 86400

# Push (ntfy). Public ntfy.sh works out of the box; self-host and set NTFY_TOKEN for private topics.
NTFY_URL = os.environ.get("NTFY_URL", "https://ntfy.sh").rstrip("/")
NTFY_TOKEN = os.environ.get("NTFY_TOKEN", "")

# Telegram notifications (Bot API). Create a bot with @BotFather and put its token here. The bot only sends to chats a
# signed-in user linked on purpose (the user opens a one-time link). Polling is used unless TELEGRAM_WEBHOOK_SECRET is set.
TELEGRAM_BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TELEGRAM_BOT_USERNAME = os.environ.get("TELEGRAM_BOT_USERNAME", "").lstrip("@")
TELEGRAM_WEBHOOK_SECRET = os.environ.get("TELEGRAM_WEBHOOK_SECRET", "")
# Public address of the web app (used for the "open" button in Telegram messages), for example https://cabin-noir.duckdns.org/app/
WEB_BASE_URL = os.environ.get("WEB_BASE_URL", "").rstrip("/")


def telegram_configured() -> bool:
    return bool(TELEGRAM_BOT_TOKEN)


# SMS (Twilio-compatible). Used for sign-in codes and escalation when configured.
TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM = os.environ.get("TWILIO_FROM", "")

# Sign-in code delivery: "sms", "ntfy_admin" (code is pushed to one private admin topic), or "dev" (echoed in the response).
OTP_NTFY_TOPIC = os.environ.get("OTP_NTFY_TOPIC", "")

# Without a cabin temperature sensor the backend cannot know the cabin is hot. When the device reports the outside
# temperature, at or above this value an occupied, locked, parked car is treated as dangerous (critical).
HOT_OUTSIDE_C = float(os.environ.get("CABIN_HOT_OUTSIDE_C", "28"))
PAUSE_MAX_MIN = 60
DEVICE_CODE_TTL_S = 600


def sms_configured() -> bool:
    return bool(TWILIO_SID and TWILIO_TOKEN and TWILIO_FROM)


def otp_channel() -> str:
    if DEV:
        return "dev"
    if sms_configured():
        return "sms"
    if OTP_NTFY_TOPIC:
        return "ntfy_admin"
    return "none"


# Update notices. The web app is replaced by deploying, so its build id (a hash of the files under web/) tells open pages to reload.
# The iPhone app is replaced by installing a new build; set APP_LATEST_IOS (for example "2.1") to tell older installs, and
# APP_UPDATE_URL (TestFlight or download page) for the button. Leave APP_LATEST_IOS empty and nothing is announced.
APP_LATEST_IOS = os.environ.get("APP_LATEST_IOS", "").strip()
APP_UPDATE_URL = os.environ.get("APP_UPDATE_URL", "").strip()
APP_UPDATE_NOTE = os.environ.get("APP_UPDATE_NOTE", "").strip()


def _web_build() -> str:
    import hashlib
    from pathlib import Path
    root = Path(__file__).resolve().parent.parent / "web"
    h = hashlib.sha1()
    if root.is_dir():
        for f in sorted(root.rglob("*")):
            if f.is_file():
                st = f.stat()
                h.update(f"{f.relative_to(root)}:{st.st_size}:{int(st.st_mtime)}".encode())
    return h.hexdigest()[:10]


WEB_BUILD = _web_build()
