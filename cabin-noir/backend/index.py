"""Vercel entrypoint. The demo database lives in /tmp, so data resets on cold starts."""
import os

os.environ.setdefault("CABIN_DB", "/tmp/cabinsentinel.db")
os.environ.setdefault("CABIN_DEV", "1")

from app.main import app  # noqa: E402,F401
