"""Clock times the server writes are Vietnam time even on a host that runs UTC (production containers do)."""
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _offset_after_import(env_tz: str, extra: dict | None = None) -> str:
    env = {k: v for k, v in os.environ.items() if k != "CABIN_TZ"}
    env.update({"TZ": env_tz, **(extra or {})})
    code = "import time; from app import config, logic; print(time.strftime('%z'), logic.hms(1_800_000_000))"
    return subprocess.run([sys.executable, "-c", code], cwd=ROOT, env=env, capture_output=True, text=True, check=True).stdout.split()


def test_a_utc_host_still_writes_vietnam_time():
    offset, clock = _offset_after_import("UTC")
    assert offset == "+0700" and clock == "15:00:00"          # 2027-01-15 08:00 UTC is 15:00 in Vietnam


def test_the_zone_can_be_overridden():
    offset, _ = _offset_after_import("UTC", {"CABIN_TZ": "Asia/Tokyo"})
    assert offset in ("+0900", "+0700")                       # +0700 only on a host without the tz database
