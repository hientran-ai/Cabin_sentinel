"""Alert card: a picture of what the system knows about an incident, drawn from data only.

It goes to Telegram with every alert, so a glance shows who is seen in the car, how hot and how sure, without a single
pixel from the camera. The cabin is one zone: the card counts people and pets, it does not say which seat.
"""
from __future__ import annotations

import io
import os
import time
from functools import lru_cache
from typing import Any

from .logic import who_text

W, H = 960, 540
FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
BG, INK, MUTED, LINE = (18, 18, 20), (245, 245, 247), (160, 160, 170), (70, 70, 80)
LEVEL = {   # header colour, label
    "critical": ((214, 40, 40), "NGHIÊM TRỌNG"),
    "warning": ((232, 150, 20), "CẢNH BÁO"),
    "resolved": ((40, 150, 80), "ĐÃ ĐÓNG"),
}
KIND = {"person": "Người", "pet": "Thú cưng", "child": "Trẻ em"}


@lru_cache(maxsize=8)
def _font(size: int, bold: bool = False):
    from PIL import ImageFont

    return ImageFont.truetype(os.path.join(FONT_DIR, "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"), size)


def _clock(t: float | None) -> str:
    return time.strftime("%H:%M:%S · %d/%m", time.localtime(t or time.time()))


def render(vehicle: dict[str, Any], incident: dict[str, Any], seats: dict[str, dict[str, Any]] | None) -> bytes:
    """PNG bytes. ``incident``: level, status, seat, confidence, cabin_temp, created_at, viewed_by, resolved_by."""
    from PIL import Image, ImageDraw

    resolved = incident.get("status") == "resolved"
    colour, label = LEVEL["resolved" if resolved else ("critical" if incident.get("level") == "critical" else "warning")]
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)

    # Header
    d.rectangle((0, 0, W, 86), fill=colour)
    d.text((32, 18), label, font=_font(34, True), fill=(255, 255, 255))
    d.text((32 + d.textlength(label, font=_font(34, True)) + 18, 30),
           "Có thể có người trong xe" if not resolved else "Đã kiểm tra xe", font=_font(24), fill=(255, 255, 255))

    # Who is seen, left half: counts for the whole cabin, never a seat
    cx1, cy1, cx2, cy2 = 40, 116, 400, 516
    d.rounded_rectangle((cx1, cy1, cx2, cy2), radius=36, fill=(30, 30, 34), outline=LINE, width=3)
    cell = (seats or {}).get("cabin") or {}
    occupied = bool(cell.get("occ")) or (not seats and not resolved)
    d.text((cx1 + 28, cy1 + 26), "Camera thấy trong xe", font=_font(20), fill=MUTED)
    rows = []
    if occupied:
        people, pets, kids = cell.get("people") or 0, cell.get("pets") or 0, cell.get("children") or 0
        if not (people or pets):
            people = 1 if cell.get("kind") != "pet" else 0
            pets = 1 - people
        if kids:
            rows.append((f"{kids} trẻ em", colour))
        if people - kids > 0:
            rows.append((f"{people - kids} người", colour))
        if pets:
            rows.append((f"{pets} thú cưng", colour))
    else:
        rows.append(("Không thấy ai", (120, 220, 150) if resolved else MUTED))
    for i, (text, col) in enumerate(rows[:3]):
        d.text((cx1 + 28, cy1 + 70 + i * 70), text, font=_font(48, True), fill=col if col != colour else INK)
    conf = cell.get("conf") or incident.get("confidence")
    if occupied and conf:
        d.text((cx1 + 28, cy2 - 92), "Độ chắc chắn cao nhất", font=_font(18), fill=MUTED)
        d.text((cx1 + 28, cy2 - 66), f"{round(conf * 100)}%", font=_font(40, True), fill=INK)

    # Facts, right half
    x, y = 440, 118
    name = f"{vehicle.get('name') or ''}"
    d.text((x, y), name, font=_font(30, True), fill=INK)
    d.text((x, y + 42), vehicle.get("plate") or "", font=_font(22), fill=MUTED)
    temp = incident.get("cabin_temp")
    d.text((x, y + 96), "Nhiệt độ cabin", font=_font(18), fill=MUTED)
    d.text((x, y + 120), "—" if temp is None else f"{temp:.1f} °C".replace(".", ","), font=_font(56, True),
           fill=(255, 120, 100) if (temp or 0) >= 35 else INK)
    d.text((x, y + 206), "Trong xe", font=_font(18), fill=MUTED)
    d.text((x, y + 230), who_text(cell) if cell.get("occ") else ("Không thấy ai" if resolved else "Có thể có người"), font=_font(26, True), fill=INK)
    d.text((x, y + 280), "Bắt đầu", font=_font(18), fill=MUTED)
    d.text((x, y + 304), _clock(incident.get("created_at")), font=_font(24), fill=INK)
    status = (f"Đã đóng: {incident.get('resolved_by')}" if resolved else
              f"Đã xem: {incident.get('viewed_by')}" if incident.get("viewed_by") else "Chưa ai xem")
    d.text((x, y + 350), status, font=_font(22, True), fill=(120, 220, 150) if resolved or incident.get("viewed_by") else (255, 200, 90))
    d.text((W - 24, H - 18), "Hình vẽ từ dữ liệu cảm biến, không phải ảnh camera", font=_font(14), fill=MUTED, anchor="rs")

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()
