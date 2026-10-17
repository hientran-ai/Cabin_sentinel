#!/usr/bin/env python3
"""Rebuild public/phone from a Cabin Noir checkout: copy the owner web UI, apply the listed patches, add the E2E bridge.

    python3 apps/cockpit-web/phone-ui/sync.py /path/to/Cabin/cabin-noir/backend/web

Every patch asserts that its target text exists, so a Noir change that moves the text fails loudly instead of silently
shipping an unpatched control (for example the manual-close button).
"""
import re
import shutil
import sys
from pathlib import Path

SRC = Path(sys.argv[1]).resolve()
HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "public" / "phone"

SKIP_DIRS = {"vendor", "samples", "cockpit", "device"}
SKIP_FILES = {"sw.js", "manifest.webmanifest", "cockpit.js", "cockpit-car.js", "cockpit-design.js", "cockpit-scenario.js",
              "device-page.js", "device-video.js", "detect.js", "cabinref.js", "check.js", "live.js", "map.js", "school.js", "report.js"}


def copy_tree() -> None:
    if OUT.exists():
        shutil.rmtree(OUT)
    for path in SRC.rglob("*"):
        rel = path.relative_to(SRC)
        if path.is_dir() or rel.parts[0] in SKIP_DIRS or path.name in SKIP_FILES:
            continue
        target = OUT / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(path, target)


def patch(rel: str, old: str, new: str, *, regex: bool = False) -> None:
    file = OUT / rel
    text = file.read_text()
    if regex:
        updated, count = re.subn(old, new, text, flags=re.S)
    else:
        count, updated = text.count(old), text.replace(old, new)
    assert count >= 1, f"patch target not found in {rel}: {old[:70]!r}"
    file.write_text(updated)


def main() -> None:
    copy_tree()
    shutil.copy2(HERE / "e2e-bridge.js", OUT / "e2e-bridge.js")
    # 1. the bridge runs before Noir's own module and the manifest/service worker are not used
    patch("index.html", '<link rel="manifest" href="manifest.webmanifest">\n', "")
    patch("index.html", '<script type="module" src="js/app.js"></script>', '<script src="e2e-bridge.js"></script>\n<script type="module" src="js/app.js"></script>')
    # 2. tabs and routes that need features this backend does not have (school trips, accounts, on-phone camera check)
    patch("js/app.js", 'const TABS = [["home", "Xe", "car"], ["school", "Đưa đón", "school"], ["history", "Lịch sử", "hist"], ["account", "Tài khoản", "user"]];',
          'const TABS = [["home", "Xe", "car"], ["history", "Lịch sử", "hist"]];')
    patch("js/app.js", 'home: () => import("./views/home.js"), incident: () => import("./views/incident.js"), school: () => import("./views/school.js"),\n  history: () => import("./views/history.js"), check: () => import("./views/check.js"), report: () => import("./views/report.js"), account: () => import("./views/account.js"),',
          'home: () => import("./views/home.js"), incident: () => import("./views/incident.js"),\n  history: () => import("./views/history.js"),')
    # 3. incident screen: the phone is not a camera, there is no manual override, "seen" does not stop repeats in this backend
    patch("js/views/incident.js", 'import { livePanel, stopLive } from "./live.js";\n', "const stopLive = () => {};\n")
    patch("js/views/incident.js", r'\n    \["owner", "confirm"\]\.includes\(S\.status && S\.status\.role\) && livePanel\(inc\.vehicle_id\),\n    canAct && h\("a", \{ class: "btn block", href: "#/check" \}[^\n]*\n', "\n", regex=True)
    patch("js/views/incident.js", "“Đã xem” chỉ dừng nhắc lặp lại. Sự cố chỉ đóng", "“Đã xem” chỉ ghi nhận bạn đã xem, không đóng sự cố và không dừng nhắc lặp. Sự cố chỉ đóng")
    patch("js/views/incident.js", r'\n    r\.code === "presence" && h\("button", \{ class: "btn small ghost needs-checks".*?"Hệ thống nhầm\? Đóng thủ công…"\)\);', ");", regex=True)
    patch("js/views/incident.js", "    evidence(inc),\n", "")   # the alert card is drawn by Noir's backend from seat data this backend does not have
    # 4. home: no pause, no camera view, no exit-check on this backend
    patch("js/views/home.js", r'\n      \(s\.role === "owner" \|\| s\.role === "confirm"\) && h\("button", \{ class: "btn", on: \{ click: \(\) => camera\(s\) \} \}[^\n]*', "", regex=True)
    patch("js/views/home.js", r': \(s\.role === "owner" \|\| s\.role === "confirm"\) && !inc && h\("button", \{ class: "btn", on: \{ click: \(\) => pauseSheet\(s, refresh\) \} \}[^\n]*\)\),', ": null),", regex=True)
    patch("js/views/home.js", "const setup = setupCard(s, ctx);", "const setup = null;")   # onboarding: add vehicle, pair device, enable push
    patch("js/views/home.js", 'import { loadMap } from "./map.js";\n', "const loadMap = () => {};\n")
    # 5. history: no photo upload, no on-phone cabin check
    patch("js/views/history.js", 'const canPhoto = ["owner", "confirm"].includes(role);', "const canPhoto = false;")
    print(f"phone UI rebuilt in {OUT} from {SRC}")


main()
