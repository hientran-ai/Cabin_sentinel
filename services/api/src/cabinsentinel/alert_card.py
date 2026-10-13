"""Alert card: a picture of a decision, drawn from data only, sent with Telegram alerts.

It shows the risk level, the vehicle code, the rule that fired, the cabin temperature and, when the camera simulator is
the vehicle's camera, the state of every calibrated seat. No pixel comes from a camera, so the card can go to a foreign
messaging service under the same rule as the text alert (notify.py): no names, plates, places or images.
"""

from __future__ import annotations

import io
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path

W, H = 960, 540
FONTS = Path(__file__).parent / "assets" / "fonts"
BG, INK, MUTED, LINE = (18, 18, 20), (245, 245, 247), (160, 160, 170), (70, 70, 80)
LEVEL = {"CRITICAL": ((214, 40, 40), "NGHIÊM TRỌNG"), "WARNING": ((232, 150, 20), "CẢNH BÁO"),
         "NOTICE": ((60, 120, 220), "LƯU Ý"), "SAFE": ((40, 150, 80), "AN TOÀN"), "ERROR": ((110, 110, 120), "LỖI DỮ LIỆU")}
SEAT_STATE = {   # fill, short label
    "OCCUPIED": ((214, 40, 40), "có người"), "SEAT_CHANGED": ((232, 150, 20), "khác lúc trống"),
    "REAR_FACING_UNVERIFIABLE": ((232, 150, 20), "ghế quay ngược"), "CANDIDATE": ((150, 110, 40), "nghi ngờ"),
    "EMPTY_VERIFIED": ((40, 110, 70), "trống"), "PENDING_EMPTY": ((50, 50, 58), "đang xác minh"), "NO_HIT": ((50, 50, 58), "không thấy"),
}


@lru_cache(maxsize=8)
def _font(size: int, bold: bool = False):
    from PIL import ImageFont

    return ImageFont.truetype(str(FONTS / ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf")), size)


def render(vehicle_id: str, state: dict, seats: dict[str, dict] | None = None, *, label: str | None = None) -> bytes:
    """PNG bytes. ``state`` is a service state (risk_level, rule_id, reason, temperature, occupancy_state)."""
    from PIL import Image, ImageDraw

    risk = str(state.get("risk_level") or "ERROR")
    colour, word = LEVEL.get(risk, LEVEL["ERROR"])
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    d.rectangle((0, 0, W, 86), fill=colour)
    d.text((32, 18), word, font=_font(34, True), fill=(255, 255, 255))
    d.text((32 + d.textlength(word, font=_font(34, True)) + 18, 30), "CabinSentinel" + (f" · {label}" if label else ""),
           font=_font(24), fill=(255, 255, 255))

    # Seats (left): one tile per calibrated seat, in calibration order.
    x0, y0, tile_w, tile_h, gap = 40, 116, 170, 112, 14
    shown = list((seats or {}).items())[:6]
    if shown:
        for i, (name, info) in enumerate(shown):
            fill, text = SEAT_STATE.get(info.get("state"), ((50, 50, 58), str(info.get("state") or "")))
            x, y = x0 + (i % 2) * (tile_w + gap), y0 + (i // 2) * (tile_h + gap)
            d.rounded_rectangle((x, y, x + tile_w, y + tile_h), radius=14, fill=fill, outline=LINE, width=2)
            d.text((x + 12, y + 12), name[:16], font=_font(18, True), fill=(255, 255, 255))
            d.text((x + 12, y + 44), text, font=_font(17), fill=(255, 255, 255))
            if info.get("confidence"):
                d.text((x + 12, y + 72), f"{round(info['confidence'] * 100)}%", font=_font(17), fill=(255, 255, 255))
    else:
        d.rounded_rectangle((x0, y0, x0 + 2 * tile_w + gap, y0 + 3 * tile_h + 2 * gap), radius=18, outline=LINE, width=2)
        d.text((x0 + tile_w + gap / 2, y0 + 1.5 * tile_h + gap), "Không có dữ liệu ghế", font=_font(18), fill=MUTED, anchor="mm")

    x, y = 440, 118
    d.text((x, y), vehicle_id, font=_font(30, True), fill=INK)
    d.text((x, y + 42), str(state.get("occupancy_state") or "UNKNOWN"), font=_font(20), fill=MUTED)
    temp = state.get("temperature")
    d.text((x, y + 92), "Nhiệt độ cabin", font=_font(18), fill=MUTED)
    d.text((x, y + 116), "—" if temp is None else f"{float(temp):.1f} °C".replace(".", ","), font=_font(56, True),
           fill=(255, 120, 100) if (temp or 0) >= 35 else INK)
    d.text((x, y + 200), "Luật", font=_font(18), fill=MUTED)
    d.text((x, y + 224), str(state.get("rule_id") or "—"), font=_font(24, True), fill=INK)
    d.text((x, y + 270), "Lúc", font=_font(18), fill=MUTED)
    d.text((x, y + 294), datetime.now(UTC).astimezone().strftime("%H:%M:%S · %d/%m"), font=_font(24), fill=INK)
    d.text((W - 24, H - 18), "Hình vẽ từ dữ liệu, không phải ảnh camera", font=_font(14), fill=MUTED, anchor="rs")
    out = io.BytesIO()
    img.save(out, "PNG", optimize=True)
    return out.getvalue()


def blurred_frame(bgr, detections: list[dict], zones: list, seats: dict[str, dict]) -> bytes:
    """Opt-in alert photo from the camera simulator: every person box AND every seat that is not verified empty is
    pixelated, so a child the detector missed (the case the empty-cabin reference catches) is hidden too. 640 px JPEG."""
    import cv2

    h, w = bgr.shape[:2]
    scale = min(1.0, 640 / w)
    img = cv2.resize(bgr, (round(w * scale), round(h * scale)), interpolation=cv2.INTER_AREA) if scale < 1 else bgr.copy()
    ih, iw = img.shape[:2]

    def pixelate(x1, y1, x2, y2):
        x1, y1, x2, y2 = max(0, int(x1)), max(0, int(y1)), min(iw, int(x2)), min(ih, int(y2))
        if x2 - x1 < 2 or y2 - y1 < 2:
            return
        region = img[y1:y2, x1:x2]
        bw, bh = max(1, (x2 - x1) // 14), max(1, (y2 - y1) // 14)
        img[y1:y2, x1:x2] = cv2.resize(cv2.resize(region, (bw, bh), interpolation=cv2.INTER_AREA), (x2 - x1, y2 - y1),
                                       interpolation=cv2.INTER_NEAREST)

    for z in zones:
        if z.kind == "seat" and (seats.get(z.name) or {}).get("state") != "EMPTY_VERIFIED":
            pixelate(z.box[0] * iw, z.box[1] * ih, z.box[2] * iw, z.box[3] * ih)
    for det in detections:
        if det.get("class") == "person" and det.get("bbox"):
            b = [v * scale for v in det["bbox"]]
            pad_x, pad_y = (b[2] - b[0]) * 0.1, (b[3] - b[1]) * 0.1
            pixelate(b[0] - pad_x, b[1] - pad_y, b[2] + pad_x, b[3] + pad_y)
            cv2.rectangle(img, (int(b[0]), int(b[1])), (int(b[2]), int(b[3])), (77, 77, 255), 2)
    cv2.rectangle(img, (0, ih - 22), (iw, ih), (0, 0, 0), -1)
    cv2.putText(img, "CabinSentinel SIMULATED - people and unverified seats pixelated", (8, ih - 7),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (255, 255, 255), 1, cv2.LINE_AA)
    ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 72])
    return buf.tobytes() if ok else b""
