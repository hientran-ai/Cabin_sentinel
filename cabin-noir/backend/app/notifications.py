"""The bell: one list of what happened across your vehicles, newest first. Built from tables that already exist
(incidents, device events, the cabin log), so it stores nothing new and follows their retention. Plain text only."""
from __future__ import annotations

from typing import Any

from . import cabinlog, config, db
from .logic import now

DAY = 86400.0
DEVICE_TITLES = ("Thiết bị trong xe đã kết nối%", "Đã ghép thiết bị trong xe%")


def _ver(v: str | None) -> tuple[int, ...]:
    out: list[int] = []
    for part in (v or "").replace("-", ".").split("."):
        if not part.isdigit():
            break
        out.append(int(part))
    return tuple(out)


def update_notice(app_version: str | None) -> dict[str, Any] | None:
    latest = config.APP_LATEST_IOS
    if not latest or not app_version or _ver(latest) <= _ver(app_version):
        return None
    return {"id": f"update:{latest}", "kind": "update", "level": "info", "title": f"Có bản cập nhật {latest}",
            "detail": config.APP_UPDATE_NOTE or f"Bạn đang dùng {app_version}. Cập nhật để có tính năng và sửa lỗi mới.",
            "at": now(), "vehicle_id": None, "vehicle_name": None, "incident_id": None, "url": config.APP_UPDATE_URL or None}


def feed(user_id: str, limit: int = 30, app_version: str | None = None) -> dict[str, Any]:
    limit = max(1, min(limit, 100))
    cars = db.all_("SELECT m.vehicle_id, v.name FROM members m JOIN vehicles v ON v.id=m.vehicle_id "
                   "WHERE m.user_id=? AND m.status='active' AND m.role IN ('owner','confirm','view')", user_id)
    items: list[dict[str, Any]] = []
    for car in cars:
        vid, name = car["vehicle_id"], car["name"]
        base = {"vehicle_id": vid, "vehicle_name": name}
        for inc in db.all_("SELECT * FROM incidents WHERE vehicle_id=? AND created_at>? ORDER BY created_at DESC LIMIT 20", vid, now() - 30 * DAY):
            lvl = "critical" if inc["level"] == "critical" else "warning"
            if inc["status"] == "open":
                items.append({**base, "id": f"inc:{inc['id']}:open", "kind": "alert", "level": lvl, "title": "Có thể có người trong xe" if lvl == "critical" else "Cảnh báo cabin",
                              "detail": inc["reason"], "at": inc["created_at"], "incident_id": inc["id"], "url": None})
            else:
                items.append({**base, "id": f"inc:{inc['id']}:closed", "kind": "resolved", "level": "info", "title": "Sự cố đã đóng",
                              "detail": f"{inc['resolved_by'] or 'Người dùng'} đã đóng sự cố.", "at": inc["resolved_at"] or inc["created_at"], "incident_id": inc["id"], "url": None})
        marks = " OR ".join("title LIKE ?" for _ in DEVICE_TITLES)
        for e in db.all_(f"SELECT id,at,title,detail FROM events WHERE vehicle_id=? AND kind='device' AND at>? AND ({marks}) ORDER BY at DESC LIMIT 10",
                         vid, now() - 30 * DAY, *DEVICE_TITLES):
            items.append({**base, "id": f"dev:{e['id']}", "kind": "device", "level": "info", "title": e["title"], "detail": e["detail"] or "", "at": e["at"], "incident_id": None, "url": None})
        for r in db.all_("SELECT * FROM cabin_log WHERE vehicle_id=? AND kind IN ('camera_blocked','device_offline') AND started_at>? ORDER BY started_at DESC LIMIT 10", vid, now() - 7 * DAY):
            j = cabinlog._row_json(r)
            if j["ongoing"] and j["duration_s"] < (cabinlog.CAMERA_MIN_S if r["kind"] == "camera_blocked" else cabinlog.OFFLINE_MIN_S):
                continue
            cam = r["kind"] == "camera_blocked"
            items.append({**base, "id": f"log:{r['id']}", "kind": "camera" if cam else "offline", "level": "warning",
                          "title": "Camera bị che" if cam else "Thiết bị mất kết nối",
                          "detail": ("Đang diễn ra. " if j["ongoing"] else "") + f"{'Không nhìn được ghế sau' if cam else 'Không có dữ liệu mới'} trong {cabinlog_dur(j['duration_s'])}. Không coi là xe an toàn.",
                          "at": r["started_at"], "incident_id": None, "url": None})
    items.sort(key=lambda i: -i["at"])
    upd = update_notice(app_version)
    if upd:
        items.insert(0, upd)
    return {"items": items[:limit], "server_build": config.WEB_BUILD, "update": upd is not None}


def cabinlog_dur(s: int) -> str:
    if s < 60:
        return f"{s} giây"
    if s < 3600:
        return f"{s // 60} phút"
    return f"{s // 3600} giờ {(s % 3600) // 60} phút"
