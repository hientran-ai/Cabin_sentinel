"""Telegram alert cards: one picture message per incident and chat, edited in place as the incident changes.

The picture is the alert card drawn from data (alertcard.py), never a camera frame. Under it: a structured caption
(level, vehicle, seat, how sure, cabin temperature, time, incident code) and buttons to open the incident, say "I have
seen it" (stops the repeat reminders, like opening the app) or mute for an hour. When someone views or closes the incident
every card of that incident is edited, so a family chat shows the current state instead of a pile of messages.

Alert photos (opt-in per vehicle, blurred on the in-car device) are sent as a reply under the card.
"""
from __future__ import annotations

import html
import json
import secrets
import time
import urllib.request
from typing import Any, Callable

from . import alertcard, config, db, logic
from .logic import SEAT_LABEL, now

Api = Callable[[str, dict[str, Any], dict[str, tuple[str, bytes, str]] | None], Any]


def _call(method: str, fields: dict[str, Any], files: dict[str, tuple[str, bytes, str]] | None = None) -> Any:
    """Bot API call; multipart when files are attached. Returns the result or None."""
    url = f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/{method}"
    if files:
        boundary = secrets.token_hex(16)
        parts: list[bytes] = []
        for k, v in fields.items():
            val = v if isinstance(v, str) else json.dumps(v)
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{val}\r\n'.encode())
        for k, (name, data, ctype) in files.items():
            parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"; filename="{name}"\r\n'
                         f"Content-Type: {ctype}\r\n\r\n".encode() + data + b"\r\n")
        body, ctype = b"".join(parts) + f"--{boundary}--\r\n".encode(), f"multipart/form-data; boundary={boundary}"
    else:
        body, ctype = json.dumps(fields).encode(), "application/json"
    req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": ctype})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            out = json.loads(r.read().decode())
            return out.get("result") if out.get("ok") else None
    except Exception:
        return None


_api: Api = _call


def set_api(fn: Api | None) -> None:
    """Tests replace the network call."""
    global _api
    _api = fn or _call


def _incident_url(iid: str) -> str | None:
    return f"{config.WEB_BASE_URL}/app/#/incident/{iid}" if config.WEB_BASE_URL.startswith("https://") else None


def _data(iid: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]] | None:
    inc = db.one("SELECT * FROM incidents WHERE id=?", iid)
    if inc is None:
        return None
    v = db.one("SELECT name, plate FROM vehicles WHERE id=?", inc["vehicle_id"])
    state = logic.load_state(inc["vehicle_id"])
    return dict(inc), dict(v) if v else {}, state.get("seats") or {}


def caption(inc: dict[str, Any], vehicle: dict[str, Any]) -> str:
    e = html.escape
    resolved = inc["status"] == "resolved"
    head = ("✅ <b>ĐÃ ĐÓNG</b> · đã kiểm tra xe" if resolved else
            "🚨 <b>NGHIÊM TRỌNG</b> · có thể có người trong xe" if inc["level"] == "critical" else
            "⚠️ <b>CẢNH BÁO</b> · có thể có người trong xe")
    seat = SEAT_LABEL.get(inc.get("seat") or "", "Không rõ ghế")
    conf = f" · {round(inc['confidence'] * 100)}%" if inc.get("confidence") else ""
    temp = "—" if inc.get("cabin_temp") is None else f"{inc['cabin_temp']:.1f} °C".replace(".", ",")
    lines = [head,
             f"🚗 {e(vehicle.get('name') or '')} · {e(vehicle.get('plate') or '')}",
             f"📍 {e(seat)}{conf}",
             f"🌡 Cabin {temp}",
             f"🕒 {time.strftime('%H:%M:%S %d/%m', time.localtime(inc['created_at']))} · mã <code>{e(inc['id'][-8:])}</code>"]
    if resolved:
        lines.append(f"✅ Đã đóng: {e(str(inc.get('resolved_by') or ''))} lúc {time.strftime('%H:%M', time.localtime(inc.get('resolved_at') or now()))}")
    elif inc.get("viewed_by"):
        lines.append(f"👀 Đã xem: {e(str(inc['viewed_by']))}. Sự cố vẫn mở tới khi có người xác nhận đã kiểm tra xe.")
    else:
        lines.append("Chưa ai xem. Thấy người trong xe: gọi 112.")
    lines.append("<i>Chỉ giám sát, không điều khiển xe.</i>")
    return "\n".join(lines)


def keyboard(inc: dict[str, Any]) -> dict[str, Any]:
    rows: list[list[dict[str, str]]] = []
    url = _incident_url(inc["id"])
    if url:
        rows.append([{"text": "📱 Mở sự cố trong Cabin Noir", "url": url}])
    if inc["status"] == "open":
        row = [{"text": "🔕 Tắt thông báo 1 giờ", "callback_data": "mute:60"}]
        if not inc.get("viewed_by"):
            row.insert(0, {"text": "👀 Tôi đã xem", "callback_data": f"ack:{inc['id']}"})
        rows.append(row)
    return {"inline_keyboard": rows}


def send(chat_id: str, iid: str) -> bool:
    """New card for this chat (first alert, or a level change that must ring again)."""
    got = _data(iid)
    if got is None:
        return False
    inc, vehicle, seats = got
    png = alertcard.render(vehicle, inc, seats)
    res = _api("sendPhoto", {"chat_id": chat_id, "caption": caption(inc, vehicle), "parse_mode": "HTML",
                             "reply_markup": keyboard(inc)}, {"photo": ("canh-bao.png", png, "image/png")})
    if not res or "message_id" not in res:
        return False
    with db.tx() as conn:
        conn.execute("INSERT OR IGNORE INTO tg_alerts(incident_id, chat_id, message_id, level, created_at) VALUES(?,?,?,?,?)",
                     (iid, chat_id, int(res["message_id"]), inc["level"], now()))
    return True


def refresh(iid: str) -> tuple[bool, str]:
    """Edit every card of this incident to its current state (viewed, closed). Returns (ok, detail) for the delivery log."""
    got = _data(iid)
    if got is None:
        return False, "skipped: không có sự cố"
    rows = db.all_("SELECT chat_id, message_id FROM tg_alerts WHERE incident_id=?", iid)
    if not rows:
        return False, "skipped: chưa gửi thẻ Telegram nào"
    inc, vehicle, seats = got
    png = alertcard.render(vehicle, inc, seats)
    media = {"type": "photo", "media": "attach://card", "caption": caption(inc, vehicle), "parse_mode": "HTML"}
    ok = sum(1 for r in rows if _api("editMessageMedia", {"chat_id": r["chat_id"], "message_id": r["message_id"], "media": media,
                                                          "reply_markup": keyboard(inc)},
                                     {"card": ("canh-bao.png", png, "image/png")}) is not None)
    return ok > 0, f"{ok}/{len(rows)} thẻ"


def send_photo(chat_id: str, iid: str, jpeg: bytes) -> bool:
    """A blurred frame from the in-car device, under this chat's latest card of the incident."""
    row = db.one("SELECT message_id FROM tg_alerts WHERE incident_id=? AND chat_id=? ORDER BY created_at DESC LIMIT 1", iid, chat_id)
    fields: dict[str, Any] = {"chat_id": chat_id, "protect_content": True,
                              "caption": "📷 Ảnh từ camera trong xe. Người trong ảnh đã được làm mờ ngay trên thiết bị. "
                                         "Cabin Noir xóa ảnh sau 24 giờ; bản trên Telegram do Telegram lưu."}
    if row:
        fields["reply_parameters"] = {"message_id": row["message_id"], "allow_sending_without_reply": True}
    return _api("sendPhoto", fields, {"photo": ("anh-canh-bao.jpg", jpeg, "image/jpeg")}) is not None


def answer(callback_id: str, text: str) -> None:
    _api("answerCallbackQuery", {"callback_query_id": callback_id, "text": text[:190]}, None)
