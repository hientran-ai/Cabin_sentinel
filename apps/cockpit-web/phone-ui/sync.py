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


PET_CHIP = """
// Owner says "there is a pet in the car": declares PET and starts the pet comfort plan through the parent page's bridge. Never changes the alert level.
function petChip() {
  const bridge = window.parent && window.parent.__phoneBridge;
  const ready = !!(bridge && bridge.petCareAvailable && bridge.petCareAvailable());
  return h("button", { class: `chip pet ${ready ? "" : "off"}`, "aria-label": "Có thú cưng trong xe", title: "Có thú cưng trong xe",
    on: { click: (e) => ready ? busy(e.currentTarget, async () => { const r = await bridge.startPetCare(); if (!r.ok) toast(r.detail, "err"); })
      : toast("Chưa bật được chế độ thú cưng: chưa có dữ liệu mới từ xe hoặc chế độ chăm sóc đang chạy.", "info") } }, icon("paw"));
}
"""


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
    LOGIC = HERE.parent / "src" / "e2e" / "phone"                                            # plain JS shared with the unit tests
    shutil.copy2(LOGIC / "demo-history.js", OUT / "demo-history.js")                         # simulated sample history for judges
    shutil.copy2(HERE / "extra" / "login.js", OUT / "js" / "views" / "login.js")             # iOS-style demo sign-in (replaces Noir's OTP screen)
    shutil.copy2(HERE / "extra" / "apple.css", OUT / "apple.css")                           # Apple look, loaded after styles.css
    shutil.copy2(HERE / "extra" / "modes.js", OUT / "js" / "views" / "modes.js")            # "Cá nhân hoá" tab (profiles, named modes, schedule)
    shutil.copy2(LOGIC / "modesLogic.js", OUT / "js" / "views" / "modesLogic.js")
    # 1. the bridge runs before Noir's own module and the manifest/service worker are not used
    patch("index.html", '<link rel="manifest" href="manifest.webmanifest">\n', "")
    patch("index.html", '<link rel="stylesheet" href="styles.css">', '<link rel="stylesheet" href="styles.css">\n<link rel="stylesheet" href="apple.css">')
    patch("index.html", '<script type="module" src="js/app.js"></script>', '<script src="demo-history.js"></script>\n<script src="e2e-bridge.js"></script>\n<script type="module" src="js/app.js"></script>')
    # 2. tabs and routes that need features this backend does not have (school trips, accounts, on-phone camera check)
    patch("js/app.js", 'const TABS = [["home", "Xe", "car"], ["school", "Đưa đón", "school"], ["history", "Lịch sử", "hist"], ["account", "Tài khoản", "user"]];',
          'const TABS = [["home", "Xe", "car"], ["history", "Lịch sử", "hist"], ["modes", "Cá nhân hoá", "gear"]];')
    patch("js/app.js", 'home: () => import("./views/home.js"), incident: () => import("./views/incident.js"), school: () => import("./views/school.js"),\n  history: () => import("./views/history.js"), check: () => import("./views/check.js"), report: () => import("./views/report.js"), account: () => import("./views/account.js"),',
          'home: () => import("./views/home.js"), incident: () => import("./views/incident.js"),\n  history: () => import("./views/history.js"), modes: () => import("./views/modes.js"),')
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
    # Pet chip next to the people/items chips: owner declares PET and starts the pet comfort plan through the parent page's bridge
    # (src/e2e/petCare.ts). The seat map is dropped (the detector gives no seat position); the "no detection is not empty" line stays.
    paw = ('ICONS.paw = [["circle",{"cx":"11","cy":"4","r":"2"}],["circle",{"cx":"18","cy":"8","r":"2"}],["circle",{"cx":"20","cy":"16","r":"2"}],'
           '["path",{"d":"M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"}]]; // Lucide paw-print\n')
    (OUT / "js/icons.js").write_text((OUT / "js/icons.js").read_text().rstrip("\n") + "\n" + paw)
    (OUT / "styles.css").write_text((OUT / "styles.css").read_text().rstrip("\n") + "\n.chip.pet svg { color: var(--accent); } .chip.pet.off { opacity: .6; }\n")
    items_chip = '    h("button", { class: "chip items", "aria-label": `Đồ vật: ${c ? c.items : "chưa có dữ liệu"}`, on: { click: () => glance(s) } }, icon("bag"), c ? c.items : "–")));\n'
    patch("js/views/home.js", items_chip, items_chip.replace('"–")));', '"–"),\n    petChip()));') +
          '  out.push(h("p", { class: "small muted", style: "margin:0" }, "Không phát hiện gì không có nghĩa là xe trống."));\n')
    patch("js/views/home.js", r'  out\.push\(h\("section", \{ class: "card gap" \}, h\("h3", \{\}, "Sơ đồ ghế"\),.*?"Không phát hiện gì không có nghĩa là xe trống\."\)\)\);\n\n', "", regex=True)
    patch("js/views/home.js", "\nasync function act(btn", PET_CHIP + "\nasync function act(btn")
    patch("js/views/home.js", 'import { addVehicle, setupCard } from "./setup.js";\n', 'import { addVehicle, setupCard } from "./setup.js";\nimport { scheduleBanner } from "./modes.js";\n')
    patch("js/views/home.js", '"Không phát hiện gì không có nghĩa là xe trống."));\n', '"Không phát hiện gì không có nghĩa là xe trống."));\n  const due = scheduleBanner();\n  if (due) out.push(due);\n')
    # Demo controls never call real emergency services. Keep this reproducible in the generator.
    patch("js/views/home.js", 'ok: "Bình thường", safe: "Bình thường"', 'ok: "Chưa thấy nguy cơ", safe: "Chưa thấy nguy cơ"')
    for rel in ("js/views/home.js", "js/views/incident.js"):
        patch(rel, r'h\("a", \{ class: "btn danger", href: "tel:112"(?:, "aria-label": "[^"]*")? \}, icon\("phone"\), "Gọi 112"\)',
              'h("button", { class: "btn danger", on: { click: () => toast("DEMO: không thực hiện cuộc gọi khẩn cấp.", "info") } }, icon("phone"), "Hỗ trợ (mô phỏng)")', regex=True)
    patch("js/views/incident.js", "và camera không còn thấy người.", "và dữ liệu mới đáp ứng điều kiện kiểm tra. Không phát hiện qua camera chưa xác minh xe trống.")
    # 5. history: no photo upload, no on-phone cabin check
    patch("js/views/history.js", 'const canPhoto = ["owner", "confirm"].includes(role);', "const canPhoto = false;")
    # History keeps everything Noir shows (strip, coverage, alerts, activity, 24 h counts, timeline, access log, CSV). Only photo upload and the
    # on-phone camera check stay off. Cards open the incident page because the report page is not part of this build.
    patch("js/views/history.js", '      canPhoto && h("button", { class: "btn icon-only", "aria-label": "Tải nhật ký (CSV)"', '      h("button", { class: "btn icon-only", "aria-label": "Tải nhật ký (CSV)"')
    patch("js/views/history.js", 'href: `#/report/${inc.id}`', 'href: `#/incident/${inc.id}`')
    patch("js/views/history.js", "/history?days=30&level=", "/history?days=${getDays()}&level=")   # the alert list follows the 7 / 30 / 90 day choice, like the log rows next to it
    print(f"phone UI rebuilt in {OUT} from {SRC}")


main()
