"""Telegram delivery (Bot API) for the web app and the mobile app, replacing ntfy when a user links a chat.

Privacy: a message holds only the vehicle name, plate and what the system saw (no phone numbers). Incident alerts are a
card drawn from data (tgcards.py); a camera frame is sent only when the vehicle's owner turned alert photos on, and only
after the in-car device blurred every person in it. A chat is linked only when the signed-in user opens a one-time link
and presses Start; /stop in the chat unlinks it. Private chats only.
"""
from __future__ import annotations

import asyncio
import json
import secrets
import urllib.request
from typing import Any, Callable

from . import config, db, mute, otp
from .logic import now

CODE_TTL_S = 600
ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
Sender = Callable[..., bool]   # chat_id, text, optional url for the "open" button, optional keyboard markup


def _api(method: str, payload: dict[str, Any], timeout: int = 12) -> Any:
    req = urllib.request.Request(f"https://api.telegram.org/bot{config.TELEGRAM_BOT_TOKEN}/{method}",
                                 data=json.dumps(payload).encode(), method="POST", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            body = json.loads(r.read().decode())
            return body.get("result") if body.get("ok") else None
    except Exception:
        return None


def _send(chat_id: str, text: str, click: str | None, markup: dict[str, Any] | None = None) -> bool:
    payload: dict[str, Any] = {"chat_id": chat_id, "text": text[:4000], "disable_web_page_preview": True}
    if markup:
        payload["reply_markup"] = markup
    elif click:
        payload["reply_markup"] = {"inline_keyboard": [[{"text": "Mở Cabin Noir", "url": click}]]}
    return _api("sendMessage", payload) is not None


_sender: Sender = _send


def set_sender(fn: Sender | None) -> None:
    """Tests replace the network call."""
    global _sender
    _sender = fn or _send


_username: str | None = None


def bot_username() -> str | None:
    global _username
    if config.TELEGRAM_BOT_USERNAME:
        return config.TELEGRAM_BOT_USERNAME
    if _username is None and config.telegram_configured():
        me = _api("getMe", {})
        _username = (me or {}).get("username")
    return _username


def chat_for(user_id: str) -> str | None:
    row = db.one("SELECT chat_id FROM telegram_links WHERE user_id=?", user_id)
    return row["chat_id"] if row else None


def link_code(user_id: str) -> dict[str, Any]:
    code = "".join(secrets.choice(ALPHABET) for _ in range(10))
    with db.tx() as conn:
        conn.execute("DELETE FROM telegram_codes WHERE user_id=? OR expires_at<?", (user_id, now()))
        conn.execute("INSERT INTO telegram_codes(code,user_id,expires_at) VALUES(?,?,?)", (code, user_id, now() + CODE_TTL_S))
    bot = bot_username()
    return {"code": code, "expires_in": CODE_TTL_S, "bot": bot, "deep_link": f"https://t.me/{bot}?start={code}" if bot else None}


def unlink(user_id: str) -> None:
    with db.tx() as conn:
        conn.execute("DELETE FROM telegram_links WHERE user_id=?", (user_id,))
        conn.execute("DELETE FROM telegram_codes WHERE user_id=?", (user_id,))


def notify(chat_id: str, title: str, message: str, urgent: bool, click: str | None = None) -> bool:
    head = ("🚨 " if urgent else "ℹ️ ") + title
    foot = "\n\nChỉ giám sát, không điều khiển xe. Thấy người trong xe: gọi 112." if urgent else ""
    return _sender(chat_id, f"{head}\n{message}{foot}\n\nTạm tắt thông báo: /tamdung 60", click)


LOGIN_PREFIX = "login_"
LOGIN_TTL_S = 600
SHARE_KEYBOARD = {"keyboard": [[{"text": "Chia sẻ số điện thoại của tôi", "request_contact": True}]], "resize_keyboard": True, "one_time_keyboard": True}
NO_KEYBOARD = {"remove_keyboard": True}


def chat_for_phone(phone: str) -> str | None:
    row = db.one("SELECT l.chat_id FROM telegram_links l JOIN users u ON u.id=l.user_id WHERE u.phone=?", phone)
    return row["chat_id"] if row else None


def send_code(chat_id: str, code: str) -> bool:
    return _sender(chat_id, f"Mã đăng nhập Cabin Noir: {code}\nCó hiệu lực 5 phút. Không chia sẻ mã này cho ai, kể cả người xưng là Cabin Noir.", None)


def login_start(phone: str) -> dict[str, Any]:
    """A one-time link to the bot for a phone that has no linked chat yet. Same shape for every phone."""
    nonce = secrets.token_urlsafe(12)
    with db.tx() as conn:
        conn.execute("DELETE FROM telegram_logins WHERE phone=? OR expires_at<?", (phone, now()))
        conn.execute("INSERT INTO telegram_logins(nonce,phone,expires_at) VALUES(?,?,?)", (nonce, phone, now() + LOGIN_TTL_S))
    bot = bot_username()
    return {"bot": bot, "deep_link": f"https://t.me/{bot}?start={LOGIN_PREFIX}{nonce}" if bot else None}


def normalize_phone(raw: str) -> str:
    """+84 373 757 653 and 84373757653 both become 0373757653."""
    digits = "".join(ch for ch in raw if ch.isdigit())
    return "0" + digits[2:] if digits.startswith("84") and len(digits) == 11 else digits


def adopt_login(conn: Any, phone: str, user_id: str) -> None:
    """After a successful sign-in with a code, a chat that proved this phone becomes the user's alert channel."""
    row = conn.execute("SELECT chat_id FROM telegram_logins WHERE phone=? AND verified=1 AND chat_id IS NOT NULL", (phone,)).fetchone()
    if row:
        conn.execute("INSERT INTO telegram_links(user_id,chat_id,linked_at) VALUES(?,?,?) "
                     "ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id, linked_at=excluded.linked_at", (user_id, row["chat_id"], now()))
    conn.execute("DELETE FROM telegram_logins WHERE phone=?", (phone,))


def _login_start_chat(chat_id: str, nonce: str) -> None:
    row = db.one("SELECT * FROM telegram_logins WHERE nonce=?", nonce)
    if row is None or row["expires_at"] < now() or (row["chat_id"] not in (None, chat_id)):
        _sender(chat_id, "Liên kết đăng nhập không đúng hoặc đã hết hạn. Quay lại Cabin Noir và bấm Gửi mã đăng nhập lại.", None)
        return
    with db.tx() as conn:
        conn.execute("UPDATE telegram_logins SET chat_id=? WHERE nonce=?", (chat_id, nonce))
    _sender(chat_id, "Để xác nhận đây là số của bạn, bấm nút bên dưới để chia sẻ số điện thoại của tài khoản Telegram này. "
                     "Cabin Noir chỉ so với số bạn vừa nhập và không lưu số lấy từ Telegram.", None, SHARE_KEYBOARD)


def _login_contact(chat_id: str, from_id: Any, contact: dict[str, Any]) -> None:
    row = db.one("SELECT * FROM telegram_logins WHERE chat_id=? AND verified=0 AND expires_at>=?", chat_id, now())
    if row is None:
        _sender(chat_id, "Không có phiên đăng nhập nào đang chờ. Quay lại Cabin Noir và bấm Gửi mã đăng nhập.", None, NO_KEYBOARD)
        return
    if str(contact.get("user_id")) != str(from_id):                      # someone else's contact forwarded: does not prove anything
        _sender(chat_id, "Hãy chia sẻ số của chính bạn bằng nút bên dưới, không gửi danh bạ của người khác.", None, SHARE_KEYBOARD)
        return
    if normalize_phone(str(contact.get("phone_number", ""))) != row["phone"]:
        _sender(chat_id, "Số điện thoại của tài khoản Telegram này khác với số đã nhập trên Cabin Noir. Kiểm tra lại số rồi thử lại.", None, NO_KEYBOARD)
        return
    code = otp.issue(row["phone"])
    with db.tx() as conn:
        conn.execute("UPDATE telegram_logins SET verified=1 WHERE nonce=?", (row["nonce"],))
    _sender(chat_id, f"Đã xác nhận số điện thoại. Mã đăng nhập Cabin Noir: {code}\nNhập mã này vào Cabin Noir (hiệu lực 5 phút). "
                     "Sau khi đăng nhập, cảnh báo xe cũng sẽ gửi tới đây.", None, NO_KEYBOARD)


def user_for_chat(chat_id: str) -> str | None:
    row = db.one("SELECT user_id FROM telegram_links WHERE chat_id=?", chat_id)
    return row["user_id"] if row else None


HELP = ("Cabin Noir gửi cảnh báo xe tới đây.\n"
        "/tamdung [phút]: tạm tắt thông báo (mặc định 60, tối đa 240), /bat: bật lại, /trangthai: xem đang tắt hay bật\n"
        "/start <mã>: liên kết (lấy mã trong web hoặc app, mục Thông báo)\n"
        "Đăng nhập: bấm Gửi mã đăng nhập trong Cabin Noir, rồi mở liên kết tới bot này.\n"
        "/stop: ngừng nhận thông báo ở cuộc trò chuyện này")


def _callback(cq: dict[str, Any]) -> None:
    """Buttons under an alert card. Only the linked person, only for a vehicle they are a member of."""
    from . import tgcards

    cid = str(cq.get("id") or "")
    chat = ((cq.get("message") or {}).get("chat") or {})
    if chat.get("type") != "private":
        return
    uid = user_for_chat(str(chat.get("id")))
    if uid is None:
        tgcards.answer(cid, "Chưa liên kết tài khoản Cabin Noir.")
        return
    action, _, arg = str(cq.get("data") or "").partition(":")
    if action == "mute":
        end = mute.start(uid, 60)
        tgcards.answer(cid, f"Đã tạm tắt thông báo đến {_hm(end)}. Nhắn /bat để bật lại.")
    elif action == "ack":
        inc = db.one("SELECT * FROM incidents WHERE id=?", arg)
        member = inc and db.one("SELECT role FROM members WHERE vehicle_id=? AND user_id=? AND status='active' AND role IN ('owner','confirm','view')",
                                inc["vehicle_id"], uid)
        if not member:
            tgcards.answer(cid, "Không tìm thấy sự cố hoặc bạn không còn quyền xem xe này.")
            return
        user = db.one("SELECT name FROM users WHERE id=?", uid)
        name = f"{user['name'] if user else 'Một người'} (Telegram)"
        if inc["status"] == "open" and inc["viewed_at"] is None:
            from . import logic
            with db.tx() as conn:
                conn.execute("UPDATE incidents SET viewed_at=?, viewed_by=? WHERE id=? AND viewed_at IS NULL", (now(), name, arg))
                logic.add_event(conn, inc["vehicle_id"], arg, "ack", f"{name} đã xem",
                                "Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe")
        tgcards.answer(cid, "Đã ghi nhận bạn đã xem. Nhớ kiểm tra xe và xác nhận trong ứng dụng.")
        tgcards.refresh(arg)
    else:
        tgcards.answer(cid, "Nút này không còn dùng được.")


def handle_update(update: dict[str, Any]) -> None:
    if update.get("callback_query"):
        _callback(update["callback_query"])
        return
    msg = update.get("message") or {}
    chat = msg.get("chat") or {}
    text = (msg.get("text") or "").strip()
    if chat.get("type") != "private" or not (text or msg.get("contact")):
        return                                  # never answer or link from groups
    chat_id = str(chat.get("id"))
    if msg.get("contact"):
        _login_contact(chat_id, (msg.get("from") or {}).get("id"), msg["contact"])
        return
    cmd, _, arg = text.partition(" ")
    cmd = cmd.split("@")[0].lower()
    if cmd == "/start" and arg.strip().startswith(LOGIN_PREFIX):
        _login_start_chat(chat_id, arg.strip()[len(LOGIN_PREFIX):])
    elif cmd == "/start" and arg.strip():
        row = db.one("SELECT * FROM telegram_codes WHERE code=?", arg.strip().upper())
        if row is None or row["expires_at"] < now():
            _sender(chat_id, "Mã liên kết không đúng hoặc đã hết hạn. Tạo mã mới trong mục Thông báo của Cabin Noir.", None)
            return
        with db.tx() as conn:
            conn.execute("INSERT INTO telegram_links(user_id,chat_id,linked_at) VALUES(?,?,?) "
                         "ON CONFLICT(user_id) DO UPDATE SET chat_id=excluded.chat_id, linked_at=excluded.linked_at",
                         (row["user_id"], chat_id, now()))
            conn.execute("DELETE FROM telegram_codes WHERE code=?", (row["code"],))
        _sender(chat_id, "Đã liên kết. Cảnh báo xe sẽ gửi tới đây. Nhắn /stop để ngừng.", None)
    elif cmd in ("/tamdung", "/mute", "/pause"):
        _mute_command(chat_id, arg)
    elif cmd in ("/bat", "/unmute", "/resume"):
        uid = user_for_chat(chat_id)
        if uid is None:
            _sender(chat_id, "Chưa liên kết tài khoản. Lấy mã trong mục Thông báo của Cabin Noir rồi nhắn /start <mã>.", None)
            return
        mute.stop(uid)
        _sender(chat_id, "Đã bật lại thông báo. Cảnh báo xe sẽ gửi tới đây như bình thường.", None)
    elif cmd in ("/trangthai", "/status"):
        uid = user_for_chat(chat_id)
        t = mute.until(uid) if uid else 0
        _sender(chat_id, ("Đang tắt thông báo cho đến khi bạn bật lại. Nhắn /bat để bật lại." if t and mute.indefinite(uid) else
                          f"Đang tạm tắt thông báo đến {_hm(t)}. Nhắn /bat để bật lại." if t else
                          "Thông báo đang bật." if uid else "Chưa liên kết tài khoản."), None)
    elif cmd == "/stop":
        with db.tx() as conn:
            conn.execute("DELETE FROM telegram_links WHERE chat_id=?", (chat_id,))
        _sender(chat_id, "Đã ngừng. Bạn sẽ không nhận thông báo Telegram nữa.", None)
    else:
        _sender(chat_id, HELP, None)


def _hm(t: float) -> str:
    import time
    return time.strftime("%H:%M", time.localtime(t))


def _mute_command(chat_id: str, arg: str) -> None:
    uid = user_for_chat(chat_id)
    if uid is None:
        _sender(chat_id, "Chưa liên kết tài khoản. Lấy mã trong mục Thông báo của Cabin Noir rồi nhắn /start <mã>.", None)
        return
    try:
        minutes = int(arg.split()[0]) if arg.strip() else None
    except ValueError:
        _sender(chat_id, "Dùng: /tamdung 30 (số phút, từ 5 đến 240).", None)
        return
    end = mute.start(uid, minutes)
    _sender(chat_id, f"Đã tạm tắt thông báo đến {_hm(end)}. Trong lúc này bạn KHÔNG nhận cảnh báo có người trong xe; "
                     "sự cố vẫn được ghi lại trong ứng dụng. Nhắn /bat để bật lại sớm hơn.", None)


async def poll_loop() -> None:
    """Long polling, used when no webhook secret is configured. One bad request never stops it."""
    offset = 0
    await asyncio.to_thread(_api, "deleteWebhook", {})
    while True:
        try:
            updates = await asyncio.to_thread(_api, "getUpdates", {"offset": offset, "timeout": 25, "allowed_updates": ["message", "callback_query"]}, 40)
            for u in updates or []:
                offset = max(offset, int(u.get("update_id", 0)) + 1)
                try:
                    await asyncio.to_thread(handle_update, u)
                except Exception as e:
                    print("telegram update:", repr(e))
            if updates is None:
                await asyncio.sleep(5)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            print("telegram poll:", repr(e))
            await asyncio.sleep(5)
