"""Alert card: a picture of what the system knows about an incident, drawn from data only.

It goes to Telegram with every alert, so a glance shows which seat, how hot and how sure, like a camera snapshot would,
without a single pixel from the camera. The car is drawn from above with its five seats; occupied seats are filled.
"""
from __future__ import annotations

import io
import os
import time
from functools import lru_cache
from typing import Any

from .logic import SEAT_LABEL, SEATS

W, H = 960, 540
FONT_DIR = os.path.join(os.path.dirname(__file__), "assets", "fonts")
BG, INK, MUTED, LINE = (18, 18, 20), (245, 245, 247), (160, 160, 170), (70, 70, 80)
LEVEL = {   # header colour, label
    "critical": ((214, 40, 40), "NGHIÊM TRỌNG"),
    "warning": ((232, 150, 20), "CẢNH BÁO"),
    "resolved": ((40, 150, 80), "ĐÃ ĐÓNG"),
}
KIND = {"person": "Người", "pet": "Thú cưng", "child": "Trẻ em"}
# Seat rectangles on the car drawing, as fractions of the car body (x1, y1, x2, y2). Front of the car is at the top.
SEAT_BOX = {
    "driver": (0.12, 0.18, 0.46, 0.40), "passenger": (0.54, 0.18, 0.88, 0.40),
    "rear_left": (0.10, 0.52, 0.36, 0.78), "rear_mid": (0.38, 0.52, 0.62, 0.78), "rear_right": (0.64, 0.52, 0.90, 0.78),
}


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

    # Car from above, left half
    cx1, cy1, cx2, cy2 = 40, 116, 400, 516
    d.rounded_rectangle((cx1, cy1, cx2, cy2), radius=70, outline=LINE, width=4)
    d.rounded_rectangle((cx1 + 40, cy1 + 18, cx2 - 40, cy1 + 58), radius=14, outline=LINE, width=3)   # windscreen
    d.text(((cx1 + cx2) / 2, cy1 + 38), "TRƯỚC", font=_font(14), fill=MUTED, anchor="mm")
    cw, ch = cx2 - cx1, cy2 - cy1
    key_seat = incident.get("seat")
    for seat in SEATS:
        fx1, fy1, fx2, fy2 = SEAT_BOX[seat]
        box = (cx1 + fx1 * cw, cy1 + fy1 * ch, cx1 + fx2 * cw, cy1 + fy2 * ch)
        info = (seats or {}).get(seat) or {}
        occupied = bool(info.get("occ")) or (seat == key_seat and not seats)
        fill = colour if occupied else (40, 40, 46)
        d.rounded_rectangle(box, radius=14, fill=fill, outline=(255, 255, 255) if seat == key_seat else LINE,
                            width=5 if seat == key_seat else 2)
        if occupied:
            conf = info.get("conf", incident.get("confidence") if seat == key_seat else None)
            kind = KIND.get(info.get("kind") or "person", "Người")
            mid = ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)
            d.text((mid[0], mid[1] - 12), kind, font=_font(18, True), fill=(255, 255, 255), anchor="mm")
            if conf:
                d.text((mid[0], mid[1] + 14), f"{round(conf * 100)}%", font=_font(18), fill=(255, 255, 255), anchor="mm")

    # Facts, right half
    x, y = 440, 118
    name = f"{vehicle.get('name') or ''}"
    d.text((x, y), name, font=_font(30, True), fill=INK)
    d.text((x, y + 42), vehicle.get("plate") or "", font=_font(22), fill=MUTED)
    temp = incident.get("cabin_temp")
    d.text((x, y + 96), "Nhiệt độ cabin", font=_font(18), fill=MUTED)
    d.text((x, y + 120), "—" if temp is None else f"{temp:.1f} °C".replace(".", ","), font=_font(56, True),
           fill=(255, 120, 100) if (temp or 0) >= 35 else INK)
    seat_text = SEAT_LABEL.get(key_seat or "", "Không rõ ghế")
    conf = incident.get("confidence")
    d.text((x, y + 206), "Vị trí", font=_font(18), fill=MUTED)
    d.text((x, y + 230), seat_text + (f" · {round(conf * 100)}%" if conf else ""), font=_font(26, True), fill=INK)
    d.text((x, y + 280), "Bắt đầu", font=_font(18), fill=MUTED)
    d.text((x, y + 304), _clock(incident.get("created_at")), font=_font(24), fill=INK)
    status = (f"Đã đóng: {incident.get('resolved_by')}" if resolved else
              f"Đã xem: {incident.get('viewed_by')}" if incident.get("viewed_by") else "Chưa ai xem")
    d.text((x, y + 350), status, font=_font(22, True), fill=(120, 220, 150) if resolved or incident.get("viewed_by") else (255, 200, 90))
    d.text((W - 24, H - 18), "Hình vẽ từ dữ liệu cảm biến, không phải ảnh camera", font=_font(14), fill=MUTED, anchor="rs")

    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()
