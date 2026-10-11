"""CabinSentinel v2 API."""
from __future__ import annotations

import os
import re
import secrets
from typing import Any, Literal, Optional

import asyncio
import hashlib
import hmac
import json
import time

from fastapi.middleware.cors import CORSMiddleware
from starlette.datastructures import MutableHeaders
from fastapi import Depends, FastAPI, Header, HTTPException, Request, Response, WebSocket, WebSocketDisconnect
from pydantic import BaseModel, Field, field_validator

from . import alerts as alert_worker
from . import cabinlog, config, db, logic, notifications, otp, push, sms, telegram
from . import history as hist
from .logic import SEAT_LABEL, now

DEV = config.DEV
PRODUCTION = config.PRODUCTION
PHONE_RE = re.compile(r"^0\d{9}$")
DEFAULT_SETTINGS = {"purpose": "both", "notify_warning": True, "notify_info": True, "exit_reminder": True,
                    "auto_cool": False, "demo_mode": not config.PRODUCTION, "notify_channel": "auto"}
CHILD_SEATS = {"left": "rear_left", "mid": "rear_mid", "right": "rear_right"}

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_: FastAPI):
    if PRODUCTION and config.otp_channel() == "none":
        raise RuntimeError("Production needs a sign-in code channel: set TWILIO_* (SMS) or OTP_NTFY_TOPIC. See docs/PRODUCTION.md.")
    seed()
    task = asyncio.create_task(worker_loop()) if (PRODUCTION or os.environ.get("CABIN_WORKER") == "1") else None
    tg = asyncio.create_task(telegram.poll_loop()) if (config.telegram_configured() and not config.TELEGRAM_WEBHOOK_SECRET) else None
    yield
    for t in (task, tg):
        if t:
            t.cancel()


async def worker_loop() -> None:
    last_purge = 0.0
    while True:
        if time.time() - last_purge > 3600:
            last_purge = time.time()
            try:
                await asyncio.to_thread(hist.purge, MEDIA_DIR)
            except Exception as e:
                print("retention:", repr(e))
        try:
            await asyncio.to_thread(alert_worker.run_once, refresh)
        except Exception as e:   # never let one bad tick stop alerting
            print("alert worker:", repr(e))
        await asyncio.sleep(5)


# The API description (/docs, /redoc, /openapi.json) is a map of every endpoint, so production does not publish it.
_DOCS = None if config.PRODUCTION else "/docs"
app = FastAPI(title="CabinSentinel API", version=config.VERSION, lifespan=lifespan,
              docs_url=_DOCS, redoc_url=None if config.PRODUCTION else "/redoc", openapi_url=None if config.PRODUCTION else "/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=config.CORS_ORIGINS, allow_origin_regex=config.CORS_ORIGIN_REGEX,
                   allow_credentials=False, allow_methods=["*"], allow_headers=["Authorization", "Content-Type"])


from starlette.middleware.gzip import GZipMiddleware

WEB_CSP = ("default-src 'self'; img-src 'self' data: blob: https://tile.openstreetmap.org https://*.tile.openstreetmap.org https://cdnjs.cloudflare.com; "
           "script-src 'self' https://cdnjs.cloudflare.com https://cdn.jsdelivr.net 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; "
           "connect-src 'self' https://nominatim.openstreetmap.org https://cdn.jsdelivr.net https://storage.googleapis.com https://tfhub.dev https://www.kaggle.com; "
           "media-src 'self' blob:; worker-src 'self' blob:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
SEC_HEADERS = {"X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY",
               "Permissions-Policy": "camera=(self), geolocation=(self), microphone=()", "Cross-Origin-Opener-Policy": "same-origin"}
RATE: dict[str, list[float]] = {}   # key -> [window start, count]


def client_ip(request: Request) -> str:
    return request.client.host if request.client else "?"


def rate_limited(key: str, limit: int) -> bool:
    """Fixed one-minute window per key: O(1) per request and a bounded table."""
    t = time.monotonic()
    w = RATE.get(key)
    if w is None or t - w[0] >= 60:
        w = RATE[key] = [t, 0]
        if len(RATE) > 20000:                       # never let the table grow without bound
            for k in [k for k, v in RATE.items() if t - v[0] >= 60][:10000]:
                RATE.pop(k, None)
    w[1] += 1
    return w[1] > limit


AUDIT_SYNC = os.environ.get("CABIN_AUDIT_SYNC") == "1"      # tests wait for the audit row; production writes it off the request path
AUDIT_SKIP = {"/v1/device/telemetry", "/v1/location", "/v1/vehicles/{vehicle_id}/telemetry", "/v1/auth/otp", "/v1/auth/verify", "/v1/device/pair"}


def _audit_request(method: str, headers: dict[bytes, bytes], path: str, params: dict[str, Any], status: int) -> None:
    """Who did what to which vehicle. No request bodies are stored. Failed and refused attempts are recorded too."""
    h = headers.get(b"authorization", b"").decode("latin-1")
    user = user_from_token(h[7:]) if h.startswith("Bearer ") else None
    with db.tx() as conn:
        hist_audit(conn, user.id if user else None, user.name if user else None, f"{method} {path}", vehicle_id=params.get("vehicle_id"),
                   target=params.get("incident_id") or params.get("member_id") or params.get("device_id") or params.get("photo_id") or params.get("child_id"),
                   outcome=hist.outcome_for(status))


hist_audit = hist.audit
_JSON = b"application/json"


class GuardMiddleware:
    """Pure ASGI (no per-request task like BaseHTTPMiddleware): body size cap, per-address rate limits, security headers, audit trail."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def _reject(self, send: Any, status: int, code: str, message: str, retry: str | None = None) -> None:
        body = json.dumps({"detail": {"code": code, "message": message}}, ensure_ascii=False).encode()
        headers = [(b"content-type", _JSON), (b"content-length", str(len(body)).encode()), (b"cache-control", b"no-store")]
        if retry:
            headers.append((b"retry-after", retry.encode()))
        await send({"type": "http.response.start", "status": status, "headers": headers})
        await send({"type": "http.response.body", "body": body})

    async def __call__(self, scope: Any, receive: Any, send: Any) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        path = scope["path"]
        headers = dict(scope["headers"])
        cl = headers.get(b"content-length", b"")
        size = int(cl) if cl.isdigit() else 0
        if size > (config.MAX_PHOTO_BODY_BYTES if path == "/v1/media/photo" else config.MAX_BODY_BYTES):
            await self._reject(send, 413, "too_large", "Yêu cầu quá lớn.")
            return
        if path.startswith("/v1/") and path != "/v1/config":
            ip = (scope.get("client") or ("?", 0))[0]
            if path.startswith("/v1/auth/") and rate_limited(f"auth:{ip}", config.RATE_AUTH_PER_MIN):
                await self._reject(send, 429, "rate_limited", "Thử quá nhiều lần. Chờ một phút.", "60")
                return
            if rate_limited(f"api:{ip}", config.RATE_API_PER_MIN):
                await self._reject(send, 429, "rate_limited", "Gửi quá nhiều yêu cầu. Chờ một chút.", "30")
                return
        seen: dict[str, int] = {}

        async def wrapped(message: Any) -> None:
            if message["type"] == "http.response.start":
                seen["status"] = message["status"]
                h = MutableHeaders(scope=message)
                for k, v in SEC_HEADERS.items():
                    h.setdefault(k, v)
                if path.startswith("/v1/"):
                    h["Cache-Control"] = "no-store"
                elif path.startswith("/app"):
                    h.setdefault("Content-Security-Policy", WEB_CSP)
                    h["Cache-Control"] = "no-cache"
                if PRODUCTION:
                    h.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
            await send(message)

        await self.app(scope, receive, wrapped)
        route = scope.get("route")
        rpath = getattr(route, "path", None)
        if rpath and rpath.startswith("/v1/") and rpath not in AUDIT_SKIP and "status" in seen and (
                scope["method"] != "GET" or "/photos/" in rpath or rpath.endswith("/audit")):
            args = (scope["method"], headers, rpath, dict(scope.get("path_params") or {}), seen["status"])
            try:
                if AUDIT_SYNC:
                    _audit_request(*args)
                else:
                    asyncio.get_running_loop().run_in_executor(None, _audit_request, *args)
            except Exception as e:           # auditing must never break a request
                print("audit:", repr(e))


app.add_middleware(GuardMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)


def err(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


# ---------------------------------------------------------------- seed

VEHICLES = [
    ("veh_vf8", "CS-VF8-2026", "VinFast VF 8", "30A-123.45", "SUV gia đình", "white", "vf8"),
    ("veh_vf6", "CS-VF6-2026", "VinFast VF 6", "51H-678.90", "Xe điện đô thị", "black", "vf6"),
    ("veh_vf9", "CS-VF9-2026", "VinFast VF 9", "29A-888.66", "Xe 7 chỗ", "white", "vf8"),
]




def seed() -> None:
    db.get_conn()
    with db.tx() as conn:
        for vid, code, model, plate, name, color, img in ([] if PRODUCTION else VEHICLES):
            conn.execute("INSERT OR IGNORE INTO vehicles(id,pair_code,model,plate,name,color,image) VALUES(?,?,?,?,?,?,?)",
                         (vid, code, model, plate, name, color, img))
            if conn.execute("SELECT 1 FROM vehicle_state WHERE vehicle_id=?", (vid,)).fetchone() is None:
                logic.save_state(conn, vid, logic.base_state())


# ---------------------------------------------------------------- auth

class User(BaseModel):
    id: str
    phone: str
    name: str


def token_hash(token: str) -> str:
    """Sign-in tokens are random 256-bit values, so a plain SHA-256 is enough. Only the hash is stored."""
    return hashlib.sha256(token.encode()).hexdigest()


code_hash = otp.code_hash


def current_user(authorization: Optional[str] = Header(None)) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise err(401, "unauthorized", "Phiên đăng nhập đã hết. Đăng nhập lại.")
    row = db.one("SELECT u.id,u.phone,u.name FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.created_at>?", token_hash(authorization[7:]), now() - config.TOKEN_TTL_S)
    if row is None:
        raise err(401, "unauthorized", "Phiên đăng nhập đã hết. Đăng nhập lại.")
    return User(**dict(row))


class OtpIn(BaseModel):
    phone: str


class VerifyIn(BaseModel):
    phone: str
    code: str
    name: Optional[str] = None


@app.get("/health")
def health() -> dict[str, Any]:
    return {"status": "ok", "time": now(), "dev": DEV, "env": config.ENV, "otp": config.otp_channel(),
            "sms": config.sms_configured(), "push": config.NTFY_URL, "web_build": config.WEB_BUILD, "version": config.VERSION}


@app.get("/v1/config")
def public_config() -> dict[str, Any]:
    """What this server can do, so the app hides what is not available (it never shows simulated data as real)."""
    return {"env": config.ENV, "production": PRODUCTION, "simulation": DEV, "climate": not PRODUCTION,
            "device_pairing": True, "push": {"server": config.NTFY_URL}, "sms": config.sms_configured(),
            "telegram": config.telegram_configured(),
            "hot_outside_c": config.HOT_OUTSIDE_C, "pause_max_min": config.PAUSE_MAX_MIN}


OTP_SENT: dict[str, list[float]] = {}
OTP_MAX, OTP_WINDOW_S = 5, 600


@app.post("/v1/auth/otp")
def send_otp(body: OtpIn) -> dict[str, Any]:
    phone = body.phone.replace(" ", "")
    if not PHONE_RE.match(phone):
        raise err(422, "invalid_phone", "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    recent = [t for t in OTP_SENT.get(phone, []) if now() - t < OTP_WINDOW_S]
    if len(recent) >= OTP_MAX:
        raise err(429, "otp_rate", "Đã gửi mã quá nhiều lần. Thử lại sau vài phút.")
    OTP_SENT[phone] = recent + [now()]
    code = otp.issue(phone)
    out: dict[str, Any] = {"sent": True, "expires_in": otp.TTL_S}
    # Telegram first. The answer is the same whether or not this phone has a linked chat (no account enumeration): a linked chat
    # gets the code at once, any other phone gets a one-time link to the bot, where sharing the phone contact proves it is theirs.
    tg_sent = False
    if config.telegram_configured():
        chat = telegram.chat_for_phone(phone)
        if chat:
            tg_sent = telegram.send_code(chat, code)
        out["telegram"] = telegram.login_start(phone)
    channel = config.otp_channel()
    if channel == "dev":
        out["dev_code"] = code
    elif tg_sent:
        pass
    elif channel == "sms":
        ok, detail = sms.send(phone, f"CabinSentinel: mã đăng nhập {code}. Có hiệu lực 5 phút. Không chia sẻ mã này.")
        if not ok and "telegram" not in out:
            raise err(502, "otp_send_failed", "Không gửi được tin nhắn mã đăng nhập. Thử lại sau.")
    elif channel == "ntfy_admin":
        ok = push.publish(config.OTP_NTFY_TOPIC, "Mã đăng nhập CabinSentinel", f"{phone}: {code} (hết hạn sau 5 phút)", priority=4, tags=["key"])
        if not ok and "telegram" not in out:
            raise err(502, "otp_send_failed", "Không gửi được mã đăng nhập. Thử lại sau.")
    elif "telegram" not in out:
        raise err(503, "otp_unavailable", "Máy chủ chưa cấu hình kênh gửi mã đăng nhập.")
    return out


@app.post("/v1/auth/verify")
def verify(body: VerifyIn, request: Request) -> dict[str, Any]:
    phone = body.phone.replace(" ", "")
    row = db.one("SELECT * FROM otps WHERE phone=?", phone)
    if row is None or row["expires_at"] < now():
        raise err(400, "otp_expired", "Mã đã hết hạn. Gửi lại mã mới.")
    if row["attempts"] >= 5:
        raise err(429, "otp_locked", "Nhập sai quá 5 lần. Gửi lại mã mới.")
    if not hmac.compare_digest(code_hash(phone, body.code.strip()), row["code_hash"]):
        with db.tx() as conn:
            conn.execute("UPDATE otps SET attempts=attempts+1 WHERE phone=?", (phone,))
        raise err(400, "otp_wrong", "Mã chưa đúng. Kiểm tra tin nhắn và nhập lại.")
    with db.tx() as conn:
        conn.execute("DELETE FROM otps WHERE phone=?", (phone,))
        u = conn.execute("SELECT * FROM users WHERE phone=?", (phone,)).fetchone()
        is_new = u is None
        if is_new:
            uid = logic.new_id("usr")
            conn.execute("INSERT INTO users(id,phone,name,created_at,settings) VALUES(?,?,?,?,?)",
                         (uid, phone, (body.name or "").strip() or "Chủ xe", now(), db.dumps(DEFAULT_SETTINGS)))
        else:
            uid = u["id"]
        conn.execute("UPDATE members SET user_id=?, status='active' WHERE phone=? AND status='pending'", (uid, phone))
        token = secrets.token_urlsafe(32)
        conn.execute("INSERT INTO tokens(token_hash,user_id,created_at,agent) VALUES(?,?,?,?)",
                     (token_hash(token), uid, now(), (request.headers.get("user-agent") or "")[:120]))
        if config.telegram_configured():
            telegram.adopt_login(conn, phone, uid)
        hist.audit(conn, uid, (body.name or "").strip() or None, "auth.login", detail={"new": is_new})
    user = db.one("SELECT id,phone,name FROM users WHERE id=?", uid)
    return {"token": token, "user": dict(user), "is_new": is_new}


@app.post("/v1/auth/logout")
def logout(authorization: str = Header(...)) -> dict[str, Any]:
    with db.tx() as conn:
        conn.execute("DELETE FROM tokens WHERE token_hash=?", (token_hash(authorization[7:]),))
    return {"ok": True}


class MeIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)


@app.get("/v1/me")
def me(user: User = Depends(current_user)) -> dict[str, Any]:
    row = db.one("SELECT settings FROM users WHERE id=?", user.id)
    return {**user.model_dump(), "settings": {**DEFAULT_SETTINGS, **db.loads(row["settings"])}}


@app.patch("/v1/me")
def update_me(body: MeIn, user: User = Depends(current_user)) -> dict[str, Any]:
    with db.tx() as conn:
        conn.execute("UPDATE users SET name=? WHERE id=?", (body.name.strip(), user.id))
    return me(User(id=user.id, phone=user.phone, name=body.name.strip()))


class SettingsIn(BaseModel):
    purpose: Optional[Literal["cabin", "school", "both"]] = None
    notify_warning: Optional[bool] = None
    notify_info: Optional[bool] = None
    exit_reminder: Optional[bool] = None
    auto_cool: Optional[bool] = None
    demo_mode: Optional[bool] = None
    notify_channel: Optional[Literal["auto", "telegram", "ntfy", "both"]] = None


@app.put("/v1/me/settings")
def put_settings(body: SettingsIn, user: User = Depends(current_user)) -> dict[str, Any]:
    row = db.one("SELECT settings FROM users WHERE id=?", user.id)
    cur = {**DEFAULT_SETTINGS, **db.loads(row["settings"])}
    cur.update({k: v for k, v in body.model_dump().items() if v is not None})
    with db.tx() as conn:
        conn.execute("UPDATE users SET settings=? WHERE id=?", (db.dumps(cur), user.id))
    return cur


# ---------------------------------------------------------------- vehicles & membership

def role_of(vehicle_id: str, user: User) -> str:
    row = db.one("SELECT role FROM members WHERE vehicle_id=? AND user_id=? AND status='active'", vehicle_id, user.id)
    if row is None:
        raise err(404, "vehicle_not_found", "Không tìm thấy xe hoặc bạn không có quyền xem xe này.")
    return row["role"]


def require(role: str, allowed: tuple[str, ...], what: str) -> None:
    if role not in allowed:
        raise err(403, "forbidden", f"Quyền của bạn không cho phép {what}.")


def car_image(model: str) -> str:
    """Which photo the apps may show. Only models we have a real photo of get one; the rest get a neutral drawing, never another model's photo."""
    m = (model or "").upper().replace(" ", "")
    return "vf6" if "VF6" in m else "vf8" if "VF8" in m else "generic"


def vehicle_row(vehicle_id: str) -> dict[str, Any]:
    row = dict(db.one("SELECT id,model,plate,name,color,image FROM vehicles WHERE id=?", vehicle_id))
    row["image"] = car_image(row["model"])
    return row


def owner_settings(vehicle_id: str) -> dict[str, Any]:
    row = db.one("SELECT u.settings FROM members m JOIN users u ON u.id=m.user_id WHERE m.vehicle_id=? AND m.role='owner'", vehicle_id)
    return {**DEFAULT_SETTINGS, **(db.loads(row["settings"]) if row else {})}


def refresh(vehicle_id: str) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Advance simulated time, evaluate, and keep the incident in sync. Returns (state, climate, verdict)."""
    with db.tx() as conn:
        state, climate = logic.advance(conn, vehicle_id)
        verdict = logic.evaluate(state)
        if verdict["level"] == "critical" and state["cabin_temp"] > logic.HOT_C and climate["status"] == "off" \
                and owner_settings(vehicle_id)["auto_cool"]:
            climate.update({"status": "sending", "target": 20, "mode": "cool", "duration_min": 20, "requested_at": now(), "auto": True})
            logic.save_climate(conn, vehicle_id, climate)
            logic.add_event(conn, vehicle_id, None, "climate", "Tự bật làm mát", "Sự cố Nghiêm trọng và cabin trên 35°C")
        logic.sync_incident(conn, vehicle_id, state, verdict)
        cabinlog.track(conn, vehicle_id, state)
    return state, climate, verdict


def tiles(state: dict[str, Any], verdict: dict[str, Any]) -> list[dict[str, str]]:
    stale = not verdict["current"]
    known = state.get("temp_known", True)
    temp = state["cabin_temp"]
    temp_tone = "red" if temp >= logic.HOT_C else ("orange" if temp >= 33 else "plain")
    lock_known = state.get("lock_known", True)
    door = {"label": "Cửa xe", "value": "Không rõ" if (stale or not lock_known) else ("Đã khóa" if state["doors_locked"] else "Chưa khóa"), "tone": "grey" if (stale or not lock_known) else "plain"}
    if known:
        cabin = {"label": "Trong cabin", "value": f"{temp:.0f}°C", "tone": "grey" if stale else temp_tone}
    else:
        out = state.get("outside_temp")
        cabin = {"label": "Ngoài trời", "value": "—" if out is None else f"{out:.0f}°C", "tone": "grey" if stale else ("orange" if (out or 0) >= config.HOT_OUTSIDE_C else "plain")}
    if verdict.get("seat"):
        third = {"label": SEAT_LABEL[verdict["seat"]], "value": f"Người {round(verdict['conf'] * 100)}%",
                 "tone": "red" if verdict["level"] == "critical" else "orange"}
    else:
        cam = state["camera"]
        third = {"label": "Camera", "value": "Không rõ" if stale else ("Hoạt động" if cam == "ok" else "Bị che"),
                 "tone": "grey" if stale else ("plain" if cam == "ok" else "orange")}
    return [door, cabin, third]


def climate_json(c: dict[str, Any]) -> dict[str, Any]:
    left = max(0, round(c["ends_at"] - now())) if c["status"] == "on" and c.get("ends_at") else 0
    return {**c, "seconds_left": left}


def exit_check(state: dict[str, Any]) -> dict[str, Any]:
    pres = logic.presence(state)
    pending = (not logic.is_stale(state) and not state["engine_on"] and not state["doors_locked"]
               and bool(pres) and state.get("exit_confirmed_at") is None)
    return {"pending": pending, "location": state["location"],
            "seats": [{"key": k, "label": SEAT_LABEL[k], "conf": v["conf"]} for k, v in pres],
            "items": state["items"], "confirmed_at": state.get("exit_confirmed_at")}


def status_json(vehicle_id: str, role: str) -> dict[str, Any]:
    state, climate, verdict = refresh(vehicle_id)
    inc = logic.open_incident(vehicle_id)
    # Live mode (demo off): simulated data is never shown as a real cabin reading. Without a real source the answer is "unknown".
    no_real_data = (PRODUCTION or not owner_settings(vehicle_id)["demo_mode"]) and state.get("source", "sim") not in logic.REAL_SOURCES
    if no_real_data:
        verdict = {"level": "unknown", "title": "Chưa có dữ liệu thật từ xe",
                   "sub": "Chưa có thiết bị trong xe gửi dữ liệu nên chưa thể nói xe an toàn. Bật chế độ dùng thử để xem mô phỏng.",
                   "current": False}
        inc = None
    out: dict[str, Any] = {"vehicle": vehicle_row(vehicle_id), "role": role, "scenario": state["scenario"], "no_real_data": no_real_data}
    if role == "school":
        out["restricted"] = True
        return out
    out.update({
        "restricted": False, "verdict": verdict, "tiles": tiles(state, verdict),
        "seats": [{"key": k, "label": SEAT_LABEL[k], **v} for k, v in state["seats"].items()],
        "items": state["items"], "cabin_temp": round(state["cabin_temp"], 1) if state.get("temp_known", True) else None, "outside_temp": state.get("outside_temp"),
        "doors_locked": state["doors_locked"], "lock_known": state.get("lock_known", True), "engine_on": state["engine_on"], "camera": state["camera"],
        # A real device that has gone quiet is offline, whatever the last message said (same rule as the device list).
        "connection": "offline" if state.get("source") in logic.REAL_SOURCES and now() - (state["last_seen"] or 0) > logic.STALE_AFTER_S else state["connection"],
        "last_seen": state["last_seen"],
        "source": state.get("source", "sim"), "detector": state.get("detector"), "device": state.get("device"), "paused_until": state.get("paused_until") if state.get("paused_until", 0) > now() else None, "coords": state.get("coords"),
        "geofence": state.get("geofence"), "in_geofence": state.get("in_geofence", False),
        "route": ({"dest": state["route"]["dest"], "progress": (state.get("coords") or {}).get("progress", 0)} if state.get("route") else None),
        "incident": logic.incident_json(inc, with_detail=True) if inc else None,
        "climate": climate_json(climate), "protection": logic.protection(state), "exit_check": exit_check(state),
    })
    return out


@app.get("/v1/vehicles")
def list_vehicles(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    rows = db.all_("SELECT vehicle_id, role FROM members WHERE user_id=? AND status='active' ORDER BY created_at", user.id)
    out = []
    for r in rows:
        s = status_json(r["vehicle_id"], r["role"])
        out.append({"vehicle": s["vehicle"], "role": r["role"],
                    "level": None if s["restricted"] else s["verdict"]["level"],
                    "title": None if s["restricted"] else s["verdict"]["title"],
                    "incident_id": (s.get("incident") or {}).get("id")})
    return out


@app.get("/v1/vehicles/{vehicle_id}/status")
def vehicle_status(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    return status_json(vehicle_id, role_of(vehicle_id, user))


@app.post("/v1/vehicles/{vehicle_id}/refresh")
def request_data(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        if state["connection"] == "online":
            state["last_seen"] = now()
            logic.save_state(conn, vehicle_id, state)
            logic.add_event(conn, vehicle_id, None, "data", "Đã yêu cầu dữ liệu mới", "Xe đã gửi kết quả nhận diện và cảm biến mới (không gửi ảnh)")
    return status_json(vehicle_id, role)


class LinkIn(BaseModel):
    pair_code: str


class LinkConfirmIn(BaseModel):
    challenge_id: str
    code: str
    name: str = Field(min_length=1, max_length=40)
    color: Literal["white", "black", "red"] = "white"


@app.post("/v1/vehicles/link")
def link_start(body: LinkIn, user: User = Depends(current_user)) -> dict[str, Any]:
    code = body.pair_code.strip().upper()
    v = db.one("SELECT * FROM vehicles WHERE pair_code=?", code)
    if v is None:
        raise err(404, "pair_code_wrong", "Mã thiết bị chưa đúng. Mã in trên thiết bị, dạng CS-XXX-2026.")
    owner = db.one("SELECT user_id FROM members WHERE vehicle_id=? AND role='owner'", v["id"])
    if owner is not None and owner["user_id"] != user.id:
        raise err(409, "already_owned", "Thiết bị đã thuộc tài khoản khác. Nhờ chủ xe mời bạn trong mục Gia đình.")
    if owner is not None:
        raise err(409, "already_linked", "Bạn đã liên kết xe này rồi.")
    cid, otp = logic.new_id("lnk"), f"{secrets.randbelow(1_000_000):06d}"
    with db.tx() as conn:
        conn.execute("INSERT INTO link_challenges(id,user_id,vehicle_id,code,expires_at) VALUES(?,?,?,?,?)",
                     (cid, user.id, v["id"], otp, now() + 300))
    out = {"challenge_id": cid, "model": v["model"], "plate": v["plate"], "suggested_name": v["name"]}
    if DEV:
        out["dev_code"] = otp
    return out


@app.post("/v1/vehicles/link/confirm")
def link_confirm(body: LinkConfirmIn, user: User = Depends(current_user)) -> dict[str, Any]:
    ch = db.one("SELECT * FROM link_challenges WHERE id=? AND user_id=?", body.challenge_id, user.id)
    if ch is None or ch["expires_at"] < now():
        raise err(400, "link_expired", "Hết thời gian liên kết. Bắt đầu lại.")
    if body.code.strip() != ch["code"]:
        raise err(400, "otp_wrong", "Mã xác nhận chưa đúng.")
    with db.tx() as conn:
        if conn.execute("SELECT 1 FROM members WHERE vehicle_id=? AND role='owner'", (ch["vehicle_id"],)).fetchone():
            raise err(409, "already_owned", "Thiết bị vừa được tài khoản khác liên kết.")
        conn.execute("UPDATE vehicles SET name=?, color=? WHERE id=?", (body.name.strip(), body.color, ch["vehicle_id"]))
        conn.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     (logic.new_id("mem"), ch["vehicle_id"], user.id, user.phone, user.name, "owner", "active", now()))
        conn.execute("DELETE FROM link_challenges WHERE id=?", (ch["id"],))
        logic.add_event(conn, ch["vehicle_id"], None, "device", "Đã liên kết xe", f"Chủ xe: {user.name}")
    return status_json(ch["vehicle_id"], "owner")


@app.delete("/v1/vehicles/{vehicle_id}")
def unlink(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    with db.tx() as conn:
        if role == "owner":
            conn.execute("DELETE FROM members WHERE vehicle_id=?", (vehicle_id,))
        else:
            conn.execute("DELETE FROM members WHERE vehicle_id=? AND user_id=?", (vehicle_id, user.id))
    return {"ok": True}


# ---------------------------------------------------------------- incidents

def incident_for(incident_id: str, user: User) -> tuple[Any, str]:
    inc = db.one("SELECT * FROM incidents WHERE id=?", incident_id)
    if inc is None:
        raise err(404, "incident_not_found", "Không tìm thấy sự cố.")
    role = role_of(inc["vehicle_id"], user)
    require(role, ("owner", "confirm", "view"), "xem sự cố")
    return inc, role


@app.get("/v1/incidents/{incident_id}")
def get_incident(incident_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    inc, _ = incident_for(incident_id, user)
    refresh(inc["vehicle_id"])
    return logic.incident_json(db.one("SELECT * FROM incidents WHERE id=?", incident_id), with_detail=True)


@app.post("/v1/incidents/{incident_id}/view")
def view_incident(incident_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    inc, _ = incident_for(incident_id, user)
    with db.tx() as conn:
        if inc["viewed_at"] is None and inc["status"] == "open":
            conn.execute("UPDATE incidents SET viewed_at=?, viewed_by=? WHERE id=?", (now(), user.name, incident_id))
            logic.add_event(conn, inc["vehicle_id"], incident_id, "ack", f"{user.name} đã xem",
                            "Sự cố vẫn mở cho tới khi có người xác nhận đã kiểm tra xe")
    return logic.incident_json(db.one("SELECT * FROM incidents WHERE id=?", incident_id), with_detail=True)


class ConfirmIn(BaseModel):
    revision: int
    checks: list[str]
    override: bool = False   # the person insists the car is empty although the camera still sees someone; only for reason "presence"


REQUIRED_CHECKS = {"seats", "floor", "trunk"}


@app.post("/v1/incidents/{incident_id}/confirm")
def confirm_check(incident_id: str, body: ConfirmIn, user: User = Depends(current_user)) -> dict[str, Any]:
    inc, role = incident_for(incident_id, user)
    require(role, ("owner", "confirm"), "xác nhận đã kiểm tra xe")
    if inc["status"] != "open":
        raise err(409, "already_resolved", "Sự cố đã được xác nhận trước đó.")
    if not REQUIRED_CHECKS.issubset(set(body.checks)):
        raise err(422, "checks_missing", "Đánh dấu đủ 3 mục đã kiểm tra.")
    state, _, _ = refresh(inc["vehicle_id"])
    inc = db.one("SELECT * FROM incidents WHERE id=?", incident_id)
    reason = logic.check_resolve(state, inc, body.revision)
    manual = bool(reason == "presence" and body.override)
    if manual:
        reason = None
    with db.tx() as conn:
        if manual:
            conn.execute("UPDATE incidents SET status='resolved', resolved_at=?, resolved_by=?, revision=revision+1 WHERE id=?",
                         (now(), f"{user.name} (đóng thủ công)", incident_id))
            logic.add_event(conn, inc["vehicle_id"], incident_id, "resolved", f"{user.name} đóng thủ công",
                            "Hệ thống vẫn thấy có người nhưng người dùng xác nhận đã kiểm tra xe. Nếu camera còn thấy người, sự cố mới sẽ được mở.")
        elif reason:
            title, text = logic.REJECT_TEXT[reason]
            logic.add_event(conn, inc["vehicle_id"], incident_id, "reject", f"Từ chối xác nhận: {title}", text)
        else:
            conn.execute("UPDATE incidents SET status='resolved', resolved_at=?, resolved_by=?, revision=revision+1 WHERE id=?",
                         (now(), user.name, incident_id))
            logic.add_event(conn, inc["vehicle_id"], incident_id, "resolved", f"{user.name} đã kiểm tra xe",
                            "Sự cố đã đóng. Không còn phát hiện người trong xe.")
    out = logic.incident_json(db.one("SELECT * FROM incidents WHERE id=?", incident_id), with_detail=True)
    out["result"] = "rejected" if reason else "resolved"
    if reason:
        out["reject"] = {"code": reason, "title": logic.REJECT_TEXT[reason][0], "message": logic.REJECT_TEXT[reason][1]}
    return out


@app.get("/v1/vehicles/{vehicle_id}/history")
def history(vehicle_id: str, days: int = 7, level: str = "all", user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    require(role, ("owner", "confirm", "view"), "xem lịch sử")
    since = now() - max(1, min(days, 90)) * 86400
    q = "SELECT * FROM incidents WHERE vehicle_id=? AND created_at>=?"
    args: list[Any] = [vehicle_id, since]
    if level in ("warning", "critical"):
        q += " AND level=?"
        args.append(level)
    incs = [logic.incident_json(r) for r in db.all_(q + " ORDER BY created_at DESC", *args)]
    evs = [dict(r) for r in db.all_("SELECT at,kind,title,detail,incident_id FROM events WHERE vehicle_id=? AND at>=? ORDER BY id DESC LIMIT 60",
                                     vehicle_id, since)]
    return {"incidents": incs, "events": evs}


# ---------------------------------------------------------------- cabin log, reports, overview

def _log_role(vehicle_id: str, user: User) -> str:
    role = role_of(vehicle_id, user)
    require(role, ("owner", "confirm", "view"), "xem nhật ký cabin")
    return role


@app.get("/v1/vehicles/{vehicle_id}/log")
def cabin_log(vehicle_id: str, days: int = 30, kind: str = "all", user: User = Depends(current_user)) -> dict[str, Any]:
    _log_role(vehicle_id, user)
    refresh(vehicle_id)
    return {"days": max(1, min(days, 365)), "items": cabinlog.listing(vehicle_id, days, kind), "stats": cabinlog.stats(vehicle_id, days),
            "chain": cabinlog.verify(vehicle_id), "retention_days": 365,
            "note": "Mỗi dòng là một lần xảy ra, có thời lượng. Không lưu ảnh. Khoảng trống không có nghĩa là xe trống."}


@app.get("/v1/vehicles/{vehicle_id}/log/summary")
def cabin_log_summary(vehicle_id: str, days: int = 7, tz: int = 420, user: User = Depends(current_user)) -> dict[str, Any]:
    _log_role(vehicle_id, user)
    refresh(vehicle_id)
    return cabinlog.summary(vehicle_id, days, tz)


@app.get("/v1/vehicles/{vehicle_id}/log/verify")
def cabin_log_verify(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    _log_role(vehicle_id, user)
    return cabinlog.verify(vehicle_id)


@app.get("/v1/vehicles/{vehicle_id}/log.csv")
def cabin_log_csv(vehicle_id: str, days: int = 30, user: User = Depends(current_user)) -> Response:
    _log_role(vehicle_id, user)
    return Response(cabinlog.csv_text(vehicle_id, max(1, min(days, 365))), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="nhat-ky-cabin-{vehicle_id[-6:]}.csv"', "Cache-Control": "no-store"})


@app.get("/v1/incidents/{incident_id}/report")
def incident_report(incident_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    inc, _ = incident_for(incident_id, user)
    refresh(inc["vehicle_id"])
    return cabinlog.report(db.one("SELECT * FROM incidents WHERE id=?", incident_id))


@app.get("/v1/me/notifications")
def my_notifications(limit: int = 30, app: Optional[str] = None, user: User = Depends(current_user)) -> dict[str, Any]:
    return notifications.feed(user.id, limit, app)


@app.get("/v1/me/overview")
def overview(days: int = 7, user: User = Depends(current_user)) -> dict[str, Any]:
    out = cabinlog.overview(user.id, days)
    out["note"] = "Số liệu lấy từ nhật ký cabin. Đo thật: từ thiết bị thật. Mô phỏng: dữ liệu thử. Chưa rõ nguồn: sự cố cũ có trước khi có nhật ký."
    return out


# ---------------------------------------------------------------- climate

class ClimateIn(BaseModel):
    action: Literal["start", "stop", "update"]
    target: Optional[int] = Field(None, ge=16, le=28)
    mode: Optional[Literal["cool", "heat", "fan"]] = None
    fan: Optional[Literal["auto", "low", "high"]] = None
    duration_min: Optional[Literal[10, 20, 30]] = None


@app.post("/v1/vehicles/{vehicle_id}/climate")
def climate(vehicle_id: str, body: ClimateIn, user: User = Depends(current_user)) -> dict[str, Any]:
    if PRODUCTION:
        raise err(404, "not_supported", "Xe này chưa kết nối được với điều hòa từ xa.")
    require(role_of(vehicle_id, user), ("owner", "confirm"), "điều khiển điều hòa")
    with db.tx() as conn:
        _, c = logic.advance(conn, vehicle_id)
        for k in ("target", "mode", "fan", "duration_min"):
            v = getattr(body, k)
            if v is not None:
                c[k] = v
        if body.action == "start" or (body.action == "update" and c["status"] == "on"):
            c.update({"status": "sending", "requested_at": now(), "auto": False})
            logic.add_event(conn, vehicle_id, None, "climate", "Đã gửi lệnh điều hòa", f"{user.name} · mục tiêu {c['target']}°C")
        elif body.action == "stop":
            c.update({"status": "off", "ends_at": None})
            logic.add_event(conn, vehicle_id, None, "climate", "Đã tắt điều hòa", user.name)
        logic.save_climate(conn, vehicle_id, c)
    return status_json(vehicle_id, role_of(vehicle_id, user))


# ---------------------------------------------------------------- camera (simulated feed metadata)

@app.get("/v1/vehicles/{vehicle_id}/camera")
def camera(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xem camera")
    state, _, verdict = refresh(vehicle_id)
    if logic.is_stale(state):
        return {"available": False, "reason": "offline", "message": "Mất kết nối với xe. Không xem được camera."}
    if state["camera"] != "ok":
        return {"available": False, "reason": "blocked", "message": "Camera đang bị che. Lấy vật che ra rồi thử lại."}
    with db.tx() as conn:
        logic.add_event(conn, vehicle_id, None, "camera", f"{user.name} đã xem camera", "Đèn xanh dương trên thiết bị nhấp nháy khi có người xem")
    return {"available": True, "simulated": True, "level": verdict["level"],
            "detections": [{"seat": k, "label": SEAT_LABEL[k], "kind": v["kind"], "conf": v["conf"], "age": v.get("age")} for k, v in logic.presence(state)],
            "items": state["items"]}


LIVE_NOTE = ("Hình trực tiếp được vẽ từ kết quả nhận diện (vị trí và nhãn). Ảnh chụp từ camera không rời thiết bị trong xe. "
             "Không thấy gì không có nghĩa là xe trống.")
LIVE_EVENT_GAP_S = 300


@app.get("/v1/vehicles/{vehicle_id}/live")
def live_view(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    """What the in-car sensor sees right now, as labelled boxes. Polled every couple of seconds while someone handles an incident,
    so it is read-only apart from one "đã xem" entry per person every few minutes."""
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xem trực tiếp")
    state, _, verdict = refresh(vehicle_id)
    seen_at = state.get("last_seen") or 0          # when the device last reported (t_at is the simulator clock and moves on every refresh)
    base = {"updated_at": seen_at or None, "age_s": round(now() - seen_at, 1), "level": verdict["level"], "note": LIVE_NOTE,
            "basis": "measured" if state.get("source") in logic.REAL_SOURCES else "simulated", "detector": state.get("detector")}
    if logic.is_stale(state):
        return {**base, "available": False, "reason": "offline", "message": "Mất kết nối với xe. Không coi là xe an toàn. Hình dưới đây không còn mới."}
    if state["camera"] != "ok":
        return {**base, "available": False, "reason": "blocked", "message": "Camera đang bị che. Lấy vật che ra rồi xem lại."}
    last = db.one("SELECT MAX(at) AS t FROM events WHERE vehicle_id=? AND kind='camera' AND title LIKE ?", vehicle_id, f"{user.name} %")
    if not last or not last["t"] or now() - last["t"] > LIVE_EVENT_GAP_S:
        with db.tx() as conn:
            logic.add_event(conn, vehicle_id, None, "camera", f"{user.name} đang xem trực tiếp", "Đèn xanh dương trên thiết bị nhấp nháy khi có người xem")
    return {**base, "available": True,
            "detections": [{"seat": k, "label": SEAT_LABEL[k], "kind": v["kind"], "conf": v["conf"], "age": v.get("age"), "box": v.get("box")} for k, v in logic.presence(state)],
            "items": state["items"]}


# ---------------------------------------------------------------- exit reminder

@app.post("/v1/vehicles/{vehicle_id}/exit-check/confirm")
def exit_confirm(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        state["exit_confirmed_at"] = now()
        logic.save_state(conn, vehicle_id, state)
        logic.add_event(conn, vehicle_id, None, "exit", f"{user.name} xác nhận đã kiểm tra ghế sau", f"Trước khi khóa xe tại {state['location']}")
    return status_json(vehicle_id, role)


# ---------------------------------------------------------------- family

class InviteIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    phone: str
    role: Literal["confirm", "view", "school"]


class RoleIn(BaseModel):
    role: Literal["confirm", "view", "school"]


def members_json(vehicle_id: str) -> list[dict[str, Any]]:
    return [dict(r) for r in db.all_("SELECT id,name,phone,role,status FROM members WHERE vehicle_id=? ORDER BY role='owner' DESC, created_at", vehicle_id)]


@app.get("/v1/vehicles/{vehicle_id}/members")
def members(vehicle_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    role_of(vehicle_id, user)
    return members_json(vehicle_id)


@app.post("/v1/vehicles/{vehicle_id}/members")
def invite(vehicle_id: str, body: InviteIn, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner",), "mời người thân")
    phone = body.phone.replace(" ", "")
    if not PHONE_RE.match(phone):
        raise err(422, "invalid_phone", "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    if db.one("SELECT 1 FROM members WHERE vehicle_id=? AND phone=?", vehicle_id, phone):
        raise err(409, "already_member", "Số này đã có trong gia đình.")
    if len(members_json(vehicle_id)) >= 8:
        raise err(409, "family_full", "Gia đình đã đủ 8 người.")
    existing = db.one("SELECT id FROM users WHERE phone=?", phone)
    with db.tx() as conn:
        conn.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     (logic.new_id("mem"), vehicle_id, existing["id"] if existing else None, phone, body.name.strip(), body.role,
                      "active" if existing else "pending", now()))
        logic.add_event(conn, vehicle_id, None, "family", f"Đã mời {body.name.strip()}", f"Quyền: {body.role}")
    return members_json(vehicle_id)


@app.patch("/v1/vehicles/{vehicle_id}/members/{member_id}")
def change_role(vehicle_id: str, member_id: str, body: RoleIn, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner",), "đổi quyền")
    with db.tx() as conn:
        n = conn.execute("UPDATE members SET role=? WHERE id=? AND vehicle_id=? AND role!='owner'", (body.role, member_id, vehicle_id)).rowcount
    if not n:
        raise err(404, "member_not_found", "Không tìm thấy người này.")
    return members_json(vehicle_id)


@app.delete("/v1/vehicles/{vehicle_id}/members/{member_id}")
def remove_member(vehicle_id: str, member_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner",), "xóa người thân")
    with db.tx() as conn:
        n = conn.execute("DELETE FROM members WHERE id=? AND vehicle_id=? AND role!='owner'", (member_id, vehicle_id)).rowcount
    if not n:
        raise err(404, "member_not_found", "Không tìm thấy người này.")
    return members_json(vehicle_id)


# ---------------------------------------------------------------- children

class ChildIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    cls: str = Field("", max_length=60)
    seat: Literal["left", "mid", "right"] = "left"
    pickup: str = Field("06:45", pattern=r"^\d{2}:\d{2}$")
    dropoff: str = Field("16:30", pattern=r"^\d{2}:\d{2}$")
    days: list[int] = [0, 1, 2, 3, 4]


def children_json(user_id: str) -> list[dict[str, Any]]:
    out = []
    for r in db.all_("SELECT * FROM children WHERE owner_id=? ORDER BY rowid", user_id):
        d = dict(r)
        d["days"] = db.loads(d["days"])
        out.append(d)
    return out


@app.get("/v1/children")
def list_children(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    return children_json(user.id)


@app.post("/v1/children")
def add_child(body: ChildIn, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    if len(children_json(user.id)) >= 4:
        raise err(409, "children_full", "Tối đa 4 bé.")
    with db.tx() as conn:
        conn.execute("INSERT INTO children(id,owner_id,name,cls,seat,pickup,dropoff,days) VALUES(?,?,?,?,?,?,?,?)",
                     (logic.new_id("kid"), user.id, body.name.strip(), body.cls.strip(), body.seat, body.pickup, body.dropoff, db.dumps(body.days)))
    return children_json(user.id)


@app.put("/v1/children/{child_id}")
def edit_child(child_id: str, body: ChildIn, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    with db.tx() as conn:
        n = conn.execute("UPDATE children SET name=?,cls=?,seat=?,pickup=?,dropoff=?,days=? WHERE id=? AND owner_id=?",
                         (body.name.strip(), body.cls.strip(), body.seat, body.pickup, body.dropoff, db.dumps(body.days), child_id, user.id)).rowcount
    if not n:
        raise err(404, "child_not_found", "Không tìm thấy bé.")
    return children_json(user.id)


@app.delete("/v1/children/{child_id}")
def delete_child(child_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    with db.tx() as conn:
        conn.execute("DELETE FROM trips WHERE child_id=?", (child_id,))
        conn.execute("DELETE FROM children WHERE id=? AND owner_id=?", (child_id, user.id))
    return children_json(user.id)


# ---------------------------------------------------------------- contacts

class ContactIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    rel: str = Field("Người thân", max_length=20)
    phone: str


@app.get("/v1/contacts")
def list_contacts(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    return [dict(r) for r in db.all_("SELECT id,name,rel,phone FROM contacts WHERE user_id=? ORDER BY rowid", user.id)]


@app.post("/v1/contacts")
def add_contact(body: ContactIn, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    phone = body.phone.replace(" ", "")
    if not PHONE_RE.match(phone):
        raise err(422, "invalid_phone", "Số điện thoại cần 10 chữ số, bắt đầu bằng 0.")
    if len(list_contacts(user)) >= 3:
        raise err(409, "contacts_full", "Tối đa 3 người liên hệ khẩn cấp.")
    with db.tx() as conn:
        conn.execute("INSERT INTO contacts(id,user_id,name,rel,phone) VALUES(?,?,?,?,?)",
                     (logic.new_id("ctc"), user.id, body.name.strip(), body.rel.strip() or "Người thân", phone))
    return list_contacts(user)


@app.delete("/v1/contacts/{contact_id}")
def delete_contact(contact_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    with db.tx() as conn:
        conn.execute("DELETE FROM contacts WHERE id=? AND user_id=?", (contact_id, user.id))
    return list_contacts(user)


# ---------------------------------------------------------------- school trips

def log_entry(code: str, child: dict[str, Any], seat: str) -> dict[str, str]:
    # Codes: "boarded" (legacy fixed text) or "key@HH:MM#m|s|g" = real time, manual / simulated / vehicle position.
    base, _, src_code = code.partition("#")
    key, _, hhmm = base.partition("@")
    t, a, b, src = logic.TRIP_LOG[key]
    if hhmm:
        t, src = hhmm, {"m": "Ghi nhận thủ công", "s": "Mô phỏng", "g": "Vị trí xe", "d": "Camera trong xe"}.get(src_code or "m", "Ghi nhận thủ công")
    return {"time": t, "title": a.format(n=child["name"], seat=seat), "detail": b.format(n=child["name"], seat=seat), "source": src}


def trip_json(vehicle_id: str, child: dict[str, Any]) -> dict[str, Any]:
    row = db.one("SELECT * FROM trips WHERE vehicle_id=? AND child_id=?", vehicle_id, child["id"])
    if row and time.strftime("%Y-%m-%d", time.localtime(row["updated_at"])) != time.strftime("%Y-%m-%d", time.localtime(now())):
        row = None   # yesterday's run: today starts again at "waiting"
    stage, log = (row["stage"], db.loads(row["log"])) if row else ("waiting", [])
    seat = SEAT_LABEL[CHILD_SEATS[child["seat"]]]
    entries = [log_entry(c, child, seat) for c in log]
    state = logic.load_state(vehicle_id)
    route, coords, geo = state.get("route"), state.get("coords"), state.get("geofence")
    dest = (route or {}).get("dest") or geo
    known = stage == "enroute" and bool(route) and bool(coords)
    progress = {"waiting": 0, "late": 0, "boarded": 4, "enroute": 50, "arrived": 100, "leftin": 100}[stage]
    if known:
        progress = max(4, min(96, round(coords["progress"] * 100)))
    return {"vehicle_id": vehicle_id, "child": child, "stage": stage, "log": list(reversed(entries)),
            "pickup": child["pickup"], "dropoff": child["dropoff"], "seat_label": seat,
            "progress": progress, "progress_known": known or stage in ("arrived", "leftin"),
            "school": dest["name"] if dest else None,
            "destination": {"name": dest["name"], "lat": dest["lat"], "lon": dest["lon"]} if dest else None,
            "origin": state.get("trip_origin") if stage in ("boarded", "enroute", "arrived") else None,
            "vehicle_coords": coords if stage in ("enroute", "arrived") else None}


@app.get("/v1/vehicles/{vehicle_id}/trips")
def trips(vehicle_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    role_of(vehicle_id, user)
    refresh(vehicle_id)  # advances the simulated drive, so arrival is recorded even if nobody opened the map
    owner = db.one("SELECT user_id FROM members WHERE vehicle_id=? AND role='owner'", vehicle_id)
    kids = children_json(owner["user_id"]) if owner else []
    return [trip_json(vehicle_id, k) for k in kids]


def set_trip(conn: Any, vehicle_id: str, owner_id: str, stage: str) -> None:
    kid = conn.execute("SELECT * FROM children WHERE owner_id=? ORDER BY rowid LIMIT 1", (owner_id,)).fetchone()
    if kid is None:
        raise err(409, "no_child", "Thêm một bé trước khi mô phỏng đưa đón.")
    row = conn.execute("SELECT * FROM trips WHERE vehicle_id=? AND child_id=?", (vehicle_id, kid["id"])).fetchone()
    log = db.loads(row["log"]) if row else []
    if stage == "waiting":
        log = []
    else:
        hhmm = time.strftime("%H:%M", time.localtime(now()))
        chain = {"boarded": ["boarded"], "enroute": ["boarded", "enroute"], "arrived": ["boarded", "enroute", "arrived"],
                 "late": ["late"], "leftin": ["boarded", "enroute", "leftin"]}[stage]
        log = [f"{k}@{hhmm}#s" if k != "late" else k for k in chain]
    conn.execute("INSERT INTO trips(id,vehicle_id,child_id,stage,log,updated_at) VALUES(?,?,?,?,?,?) "
                 "ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, log=excluded.log, updated_at=excluded.updated_at",
                 (row["id"] if row else logic.new_id("trp"), vehicle_id, kid["id"], stage, db.dumps(log), now()))


# ---------------------------------------------------------------- simulator (demo only)

class ScenarioIn(BaseModel):
    name: str


@app.post("/v1/sim/vehicles/{vehicle_id}/scenario")
def scenario(vehicle_id: str, body: ScenarioIn, user: User = Depends(current_user)) -> dict[str, Any]:
    if not DEV:
        raise err(404, "not_found", "Không có trong bản phát hành.")
    role = role_of(vehicle_id, user)
    require(role, ("owner",), "chạy mô phỏng")
    if body.name not in logic.SCENARIOS:
        raise err(422, "unknown_scenario", "Kịch bản không tồn tại.")
    if logic.load_state(vehicle_id).get("source") in logic.REAL_SOURCES:
        raise err(409, "sim_paused", "Đang dùng camera điện thoại làm thiết bị trong xe nên mô phỏng tạm dừng. Dừng camera điện thoại để quay lại mô phỏng.")
    with db.tx() as conn:
        state = logic.apply_scenario(logic.load_state(vehicle_id), body.name)
        logic.save_state(conn, vehicle_id, state)
        if body.name.startswith("trip_"):
            stage = {"trip_boarded": "boarded", "trip_enroute": "enroute", "trip_arrived": "arrived",
                     "trip_late": "late", "trip_leftin": "leftin", "trip_reset": "waiting"}[body.name]
            set_trip(conn, vehicle_id, user.id, stage)
        logic.add_event(conn, vehicle_id, None, "sim", "Mô phỏng", body.name)
        if body.name == "route_start":
            try:
                set_trip(conn, vehicle_id, user.id, "enroute")  # the child boards, then the drive starts
            except HTTPException:
                pass  # no child registered: the drive still runs
    return status_json(vehicle_id, role)


# ---------------------------------------------------------------- phone as a test sensor

Box = Optional[list[float]]   # [x, y, w, h], each 0..1 of the frame. Position only; the picture itself never leaves the device.


def _check_box(v: Box) -> Box:
    """Clip a rounding overshoot (up to 2% of the frame) instead of rejecting the whole frame; refuse anything clearly wrong."""
    if v is None:
        return None
    if len(v) != 4 or any(not (0.0 <= x <= 1.0) for x in v) or v[0] + v[2] > 1.02 or v[1] + v[3] > 1.02:
        raise ValueError("box must be [x, y, w, h] inside the frame")
    x, y = v[0], v[1]
    return [round(x, 3), round(y, 3), round(min(v[2], 1.0 - x), 3), round(min(v[3], 1.0 - y), 3)]


class DetIn(BaseModel):
    seat: Literal["rear_left", "rear_mid", "rear_right", "passenger"]
    kind: Literal["person", "pet"]
    conf: float = Field(ge=0, le=1)
    box: Box = None

    @field_validator("box")
    @classmethod
    def _box(cls, v: Box) -> Box:
        return _check_box(v)

    # Hint only (head/body proportion, not a trained model). Never affects the risk level.
    age: Optional[Literal["child", "adult", "unknown"]] = None


class ItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=30)
    seat: Literal["rear_left", "rear_mid", "rear_right", "passenger"]
    conf: float = Field(ge=0, le=1)
    box: Box = None

    @field_validator("box")
    @classmethod
    def _box(cls, v: Box) -> Box:
        return _check_box(v)


class TelemetryIn(BaseModel):
    # Preferred: one entry per detected occupant/item, already assigned to a seat by the sensor.
    detections: Optional[list[DetIn]] = Field(None, max_length=8)
    items: list[ItemIn] = Field(default_factory=list, max_length=12)
    model: Optional[str] = Field(None, max_length=40)  # which detector produced this frame
    seat: Literal["rear_left", "rear_mid", "rear_right", "passenger"] = "rear_right"
    person_conf: float = Field(0, ge=0, le=1)
    pet_conf: float = Field(0, ge=0, le=1)
    camera_ok: bool = True
    locked: bool = True
    engine_on: bool = False   # the in-car device reports engine state; running engine pauses cabin monitoring
    cabin_temp: Optional[float] = Field(None, ge=-10, le=80)
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lon: Optional[float] = Field(None, ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=100000)


def apply_geofence(conn: Any, vehicle_id: str, state: dict[str, Any], lat: float, lon: float) -> None:
    g = state.get("geofence")
    if not g:
        return
    inside = logic.distance_m(g["lat"], g["lon"], lat, lon) <= g["radius_m"]
    if inside and not state.get("in_geofence"):
        state["exit_confirmed_at"] = None  # a new arrival needs a new check
        logic.add_event(conn, vehicle_id, None, "geofence", f"Xe đã tới {g['name']}", "Theo vị trí thiết bị trong xe")
    elif not inside and state.get("in_geofence"):
        logic.add_event(conn, vehicle_id, None, "geofence", f"Xe đã rời {g['name']}", "Theo vị trí thiết bị trong xe")
    state["in_geofence"] = inside
    if inside:
        state["location"] = g["name"]


BOARD_AFTER_S = 3        # the child's seat must have been occupied this long before "boarded"
LEFT_IN_AFTER_S = 120    # still occupied this long after arriving at the school: "left in"
CLEAR_AFTER_S = 10       # an empty seat for this long takes "left in" back to "arrived"


def auto_trips(conn: Any, vehicle_id: str, state: dict[str, Any]) -> None:
    """Move today's school trips along from what the in-car device itself sees, never from a guess about the child:
    boarded/en route = the child's seat is occupied by a person and the car is moving; arrived = parked inside the
    destination zone; left in = the seat is still occupied a while after arriving. The alert itself comes from the
    normal cabin pipeline, this only tells the trip what happened. Age labels play no part."""
    owner = conn.execute("SELECT user_id FROM members WHERE vehicle_id=? AND role='owner'", (vehicle_id,)).fetchone()
    if owner is None:
        return
    kids = conn.execute("SELECT * FROM children WHERE owner_id=? ORDER BY rowid", (owner["user_id"],)).fetchall()
    t = now()
    day = time.strftime("%Y-%m-%d", time.localtime(t))
    hhmm = time.strftime("%H:%M", time.localtime(t))
    driving, inside = bool(state.get("engine_on")), bool(state.get("in_geofence"))
    seen = state.get("camera") == "ok"
    watch = state.setdefault("trip_watch", {})
    for kid in kids:
        cell = state.get("seats", {}).get(CHILD_SEATS[kid["seat"]]) or {}
        occ = bool(seen and cell.get("occ") and cell.get("kind") == "person")
        w = watch.setdefault(kid["id"], {})
        if occ:
            w.setdefault("since", t)
        else:
            w.pop("since", None)
            w.setdefault("empty_since", t)
        if occ:
            w.pop("empty_since", None)
        held = t - w["since"] if occ else 0.0
        empty = t - w["empty_since"] if not occ and "empty_since" in w else 0.0
        row = conn.execute("SELECT * FROM trips WHERE vehicle_id=? AND child_id=?", (vehicle_id, kid["id"])).fetchone()
        if row and time.strftime("%Y-%m-%d", time.localtime(row["updated_at"])) != day:
            row = None
        stage, log = (row["stage"], db.loads(row["log"])) if row else ("waiting", [])
        new: str | None = None
        add: list[str] = []
        what = ""
        if stage in ("waiting", "late") and occ and held >= BOARD_AFTER_S and driving:
            new, add, what = "enroute", [f"boarded@{hhmm}#d", f"enroute@{hhmm}#d"], f"{kid['name']} lên xe, xe bắt đầu chạy"
        elif stage == "boarded" and driving:
            new, add, what = "enroute", [f"enroute@{hhmm}#d"], "Xe bắt đầu chạy"
        elif stage in ("boarded", "enroute") and inside and not driving:
            new, add, what = "arrived", [f"arrived@{hhmm}#g"], "Xe đã đỗ tại điểm đến"
        elif stage == "arrived" and occ and not driving and held >= LEFT_IN_AFTER_S:
            new, add, what = "leftin", [f"leftin@{hhmm}#d"], f"Ghế của {kid['name']} vẫn còn người sau khi tới điểm đến"
        elif stage == "leftin" and not occ and empty >= CLEAR_AFTER_S:
            new, add, what = "arrived", [f"arrived@{hhmm}#d"], f"Ghế của {kid['name']} đã trống"
        if new is None:
            continue
        conn.execute("INSERT INTO trips(id,vehicle_id,child_id,stage,log,updated_at) VALUES(?,?,?,?,?,?) "
                     "ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, log=excluded.log, updated_at=excluded.updated_at",
                     (row["id"] if row else logic.new_id("trp"), vehicle_id, kid["id"], new, db.dumps(log + add), t))
        logic.add_event(conn, vehicle_id, None, "trip", what, "Theo camera và vị trí của thiết bị trong xe")

def ingest_telemetry(conn: Any, vehicle_id: str, body: TelemetryIn, source: str) -> None:
    """Store one frame from a sensor. `source` is "phone" (dev only: the owner's phone as a test sensor) or "device"
    (a paired in-car device). A device cannot see door locks or a cabin thermometer, so it never claims to."""
    state = logic.load_state(vehicle_id)
    first = state.get("source") not in logic.REAL_SOURCES
    seats = {k: {"occ": False, "conf": 0.0, "kind": None} for k in state["seats"]}
    if body.detections is not None:
        for d in body.detections:
            if d.conf >= 0.5 and d.conf > seats[d.seat]["conf"]:
                seats[d.seat] = {"occ": True, "conf": round(d.conf, 2), "kind": d.kind, "age": d.age, "box": d.box}
    else:
        conf, kind = max((body.person_conf, "person"), (body.pet_conf, "pet"))
        if conf >= 0.5:
            seats[body.seat] = {"occ": True, "conf": round(conf, 2), "kind": kind}
    state.update({"source": source, "scenario": source, "connection": "online", "last_seen": now(), "t_at": now(),
                  "camera": "ok" if body.camera_ok else "blocked", "engine_on": body.engine_on, "seats": seats,
                  "items": [i.model_dump() for i in body.items if i.conf >= 0.5], "detector": body.model})
    if source == "device":
        dev = body  # DeviceTelemetryIn
        state.update({"doors_locked": True, "lock_known": False, "signal": None})
        if getattr(dev, "battery_pct", None) is not None:
            state["battery"] = int(dev.battery_pct)
        state["charging"] = bool(getattr(dev, "charging", False))
        state["thermal"] = getattr(dev, "thermal", None)
        if getattr(dev, "outside_temp", None) is not None:
            state["outside_temp"] = dev.outside_temp
        state["temp_known"] = body.cabin_temp is not None
    else:
        state["doors_locked"] = body.locked
    if body.cabin_temp is not None:
        state["cabin_temp"] = body.cabin_temp
    if body.lat is not None and body.lon is not None:
        state["coords"] = {"lat": body.lat, "lon": body.lon, "accuracy_m": body.accuracy_m, "at": now()}
        state["location"] = "Vị trí thiết bị trong xe" if source == "device" else "Vị trí điện thoại"
        apply_geofence(conn, vehicle_id, state, body.lat, body.lon)
    if source == "device":
        auto_trips(conn, vehicle_id, state)
    logic.save_state(conn, vehicle_id, state)
    hist.record_observation(conn, vehicle_id, state, source)
    if body.lat is not None and body.lon is not None:
        hist.record_location(conn, vehicle_id, body.lat, body.lon, body.accuracy_m, None, source)
    if first:
        if source == "device":
            logic.add_event(conn, vehicle_id, None, "device", "Thiết bị trong xe đã kết nối", "Bắt đầu giám sát hàng ghế sau")
        else:
            logic.add_event(conn, vehicle_id, None, "sim", "Mô phỏng", "Dùng camera điện thoại làm cảm biến thử nghiệm")


@app.post("/v1/vehicles/{vehicle_id}/telemetry")
def telemetry(vehicle_id: str, body: TelemetryIn, user: User = Depends(current_user)) -> dict[str, Any]:
    """Test-only: the owner's phone camera and GPS stand in for the in-car device."""
    if not DEV:
        raise err(404, "not_found", "Không có trong bản phát hành.")
    role = role_of(vehicle_id, user)
    require(role, ("owner",), "dùng điện thoại làm cảm biến thử nghiệm")
    with db.tx() as conn:
        ingest_telemetry(conn, vehicle_id, body, "phone")
    return status_json(vehicle_id, role)


@app.delete("/v1/vehicles/{vehicle_id}/telemetry")
def telemetry_stop(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    if not DEV:
        raise err(404, "not_found", "Không có trong bản phát hành.")
    role = role_of(vehicle_id, user)
    require(role, ("owner",), "dừng cảm biến thử nghiệm")
    with db.tx() as conn:
        state = logic.apply_scenario(logic.load_state(vehicle_id), "safe")
        logic.save_state(conn, vehicle_id, state)
    return status_json(vehicle_id, role)


class GeofenceIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    radius_m: int = Field(150, ge=30, le=1000)


@app.put("/v1/vehicles/{vehicle_id}/geofence")
def set_geofence(vehicle_id: str, body: GeofenceIn, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    require(role, ("owner",), "đặt vùng trường học")
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        state["geofence"] = body.model_dump()
        state["in_geofence"] = False
        logic.save_state(conn, vehicle_id, state)
    return status_json(vehicle_id, role)


@app.delete("/v1/vehicles/{vehicle_id}/geofence")
def clear_geofence(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    require(role, ("owner",), "xóa vùng trường học")
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        state.pop("geofence", None); state.pop("in_geofence", None)
        logic.save_state(conn, vehicle_id, state)
    return status_json(vehicle_id, role)


# ---------------------------------------------------------------- location

def location_json(vehicle_id: str) -> dict[str, Any]:
    state, _, _ = refresh(vehicle_id)
    c = state.get("coords")
    route = state.get("route")
    dest = (route or {}).get("dest") or state.get("geofence")
    return {"vehicle_id": vehicle_id, "coords": c, "source": state.get("source", "sim"),
            "destination": ({"name": dest["name"], "lat": dest["lat"], "lon": dest["lon"]} if dest else None),
            "moving": bool(route), "stale": logic.is_stale(state) or (c is not None and now() - c.get("at", 0) > logic.STALE_AFTER_S),
            "location_name": state["location"]}


@app.get("/v1/vehicles/{vehicle_id}/location")
def vehicle_location(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner", "confirm", "view"), "xem vị trí xe")
    return location_json(vehicle_id)


class LocationIn(BaseModel):
    vehicle_id: str
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    accuracy_m: Optional[float] = Field(None, ge=0, le=100000)
    heading: Optional[float] = Field(None, ge=0, le=360)


@app.post("/v1/location")
def post_location(body: LocationIn, user: User = Depends(current_user)) -> dict[str, Any]:
    """Live mode: the owner's phone rides in the car, so its GPS is the vehicle position."""
    require(role_of(body.vehicle_id, user), ("owner",), "cập nhật vị trí xe")
    with db.tx() as conn:
        state = logic.load_state(body.vehicle_id)
        state["coords"] = {"lat": body.lat, "lon": body.lon, "accuracy_m": body.accuracy_m, "at": now(), "heading": body.heading}
        apply_geofence(conn, body.vehicle_id, state, body.lat, body.lon)
        logic.save_state(conn, body.vehicle_id, state)
        hist.record_location(conn, body.vehicle_id, body.lat, body.lon, body.accuracy_m, body.heading, "owner_phone")
    return location_json(body.vehicle_id)


# ---------------------------------------------------------------- alerts (incident aliases)

@app.get("/v1/alerts")
def alerts(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    rows = db.all_("SELECT vehicle_id, role FROM members WHERE user_id=? AND status='active' AND role!='school'", user.id)
    out: list[dict[str, Any]] = []
    for r in rows:
        refresh(r["vehicle_id"])
        for inc in db.all_("SELECT * FROM incidents WHERE vehicle_id=? ORDER BY created_at DESC LIMIT 20", r["vehicle_id"]):
            out.append(logic.incident_json(inc))
    out.sort(key=lambda i: (i["status"] != "open", -i["created_at"]))
    return out


@app.post("/v1/alerts/{incident_id}/acknowledge")
def acknowledge(incident_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    """Same as /view: acknowledging never resolves the incident; only a confirmed cabin check does."""
    return view_incident(incident_id, user)


# ---------------------------------------------------------------- manual school check-in

class CheckInIn(BaseModel):
    vehicle_id: str
    cabin_checked: bool = False   # the person confirms they looked inside the cabin; never resolves an incident by itself


def manual_trip(child_id: str, vehicle_id: str, user: User, stage: str, cabin_checked: bool = False) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner", "confirm", "school"), "ghi nhận đưa đón")
    owner = db.one("SELECT user_id FROM members WHERE vehicle_id=? AND role='owner'", vehicle_id)
    kid = db.one("SELECT * FROM children WHERE id=? AND owner_id=?", child_id, owner["user_id"]) if owner else None
    if kid is None:
        raise err(404, "child_not_found", "Không tìm thấy bé trên xe này.")
    if stage == "arrived" and not cabin_checked:
        st = logic.load_state(vehicle_id)
        if not logic.is_stale(st) and logic.presence(st):
            raise err(409, "still_detected", "Camera vẫn thấy người ở ghế sau. Kiểm tra cabin rồi xác nhận để ghi nhận xuống xe.")
    hhmm = time.strftime("%H:%M", time.localtime(now()))
    with db.tx() as conn:
        row = conn.execute("SELECT * FROM trips WHERE vehicle_id=? AND child_id=?", (vehicle_id, child_id)).fetchone()
        log = ["boarded@" + hhmm] if stage == "boarded" else (db.loads(row["log"]) if row else []) + ["arrived@" + hhmm]
        conn.execute("INSERT INTO trips(id,vehicle_id,child_id,stage,log,updated_at) VALUES(?,?,?,?,?,?) "
                     "ON CONFLICT(id) DO UPDATE SET stage=excluded.stage, log=excluded.log, updated_at=excluded.updated_at",
                     (row["id"] if row else logic.new_id("trp"), vehicle_id, child_id, stage, db.dumps(log), now()))
        logic.add_event(conn, vehicle_id, None, "trip", f"{user.name} ghi nhận {kid['name']} " + ("lên xe" if stage == "boarded" else "xuống xe"),
                        "Ghi nhận thủ công")
    child = dict(kid)
    child["days"] = db.loads(child["days"])
    return trip_json(vehicle_id, child)


@app.get("/v1/trips")
def all_trips(user: User = Depends(current_user)) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for r in db.all_("SELECT vehicle_id FROM members WHERE user_id=? AND status='active'", user.id):
        out += trips(r["vehicle_id"], user)
    return out


@app.post("/v1/trips/{child_id}/pickup")
def trip_pickup(child_id: str, body: CheckInIn, user: User = Depends(current_user)) -> dict[str, Any]:
    return manual_trip(child_id, body.vehicle_id, user, "boarded")


@app.post("/v1/trips/{child_id}/dropoff")
def trip_dropoff(child_id: str, body: CheckInIn, user: User = Depends(current_user)) -> dict[str, Any]:
    return manual_trip(child_id, body.vehicle_id, user, "arrived", body.cabin_checked)


# ---------------------------------------------------------------- photo upload

MEDIA_DIR = os.environ.get("CABIN_MEDIA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "media"))
MAX_PHOTO = 6 * 1024 * 1024
MAGIC = {b"\xff\xd8\xff": "jpg", b"\x89PNG": "png"}


@app.post("/v1/media/photo")
async def upload_photo(request: Request, vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    """Raw image bytes in the body (JPEG or PNG), sent only after the user confirms the preview."""
    require(role_of(vehicle_id, user), ("owner", "confirm", "school"), "gửi ảnh")
    data = await request.body()
    if not data or len(data) > MAX_PHOTO:
        raise err(413 if data else 422, "bad_photo", "Ảnh trống hoặc lớn hơn 6 MB.")
    ext = next((e for m, e in MAGIC.items() if data.startswith(m)), None)
    if ext is None:
        raise err(415, "bad_photo", "Chỉ nhận ảnh JPEG hoặc PNG.")
    pid = logic.new_id("img")
    os.makedirs(MEDIA_DIR, exist_ok=True)
    with open(os.path.join(MEDIA_DIR, f"{vehicle_id}__{pid}.{ext}"), "wb") as f:
        f.write(data)
    with db.tx() as conn:
        hist.add_media(conn, pid, vehicle_id, ext, data, user.id)
        logic.add_event(conn, vehicle_id, None, "photo", f"{user.name} đã gửi ảnh", f"{len(data) // 1024} KB")
    return {"id": pid, "bytes": len(data), "type": ext}


@app.get("/v1/vehicles/{vehicle_id}/photos")
def list_photos(vehicle_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xem ảnh")
    hist.adopt_legacy_media(MEDIA_DIR, vehicle_id)
    return [{"id": r["id"], "type": r["ext"], "created_at": r["created_at"], "expires_at": r["expires_at"], "size_bytes": r["size_bytes"]}
            for r in db.all_("SELECT * FROM media WHERE vehicle_id=? AND expires_at>? ORDER BY created_at DESC", vehicle_id, now())]


@app.delete("/v1/vehicles/{vehicle_id}/photos/{photo_id}")
def delete_photo(vehicle_id: str, photo_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xóa ảnh")
    row = db.one("SELECT id, ext FROM media WHERE id=? AND vehicle_id=?", photo_id, vehicle_id)
    if row is None:
        raise err(404, "photo_not_found", "Không tìm thấy ảnh.")
    hist.delete_media_file(MEDIA_DIR, vehicle_id, photo_id, row["ext"])
    with db.tx() as conn:
        conn.execute("DELETE FROM media WHERE id=?", (photo_id,))
        logic.add_event(conn, vehicle_id, None, "photo", f"{user.name} đã xóa một ảnh", "")
    return {"ok": True}


@app.get("/v1/vehicles/{vehicle_id}/photos/{photo_id}")
def get_photo(vehicle_id: str, photo_id: str, user: User = Depends(current_user)) -> Response:
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xem ảnh")
    if not re.fullmatch(r"img_[A-Za-z0-9]+", photo_id):
        raise err(404, "photo_not_found", "Không tìm thấy ảnh.")
    for ext, mime in (("jpg", "image/jpeg"), ("png", "image/png")):
        path = os.path.join(MEDIA_DIR, f"{vehicle_id}__{photo_id}.{ext}")
        if os.path.isfile(path):
            with open(path, "rb") as f:
                return Response(f.read(), media_type=mime)
    raise err(404, "photo_not_found", "Không tìm thấy ảnh.")


# ---------------------------------------------------------------- realtime

def user_from_token(token: Optional[str]) -> Optional[User]:
    row = db.one("SELECT u.id,u.phone,u.name FROM tokens t JOIN users u ON u.id=t.user_id WHERE t.token_hash=? AND t.created_at>?", token_hash(token), now() - config.TOKEN_TTL_S) if token else None
    return User(**dict(row)) if row else None


def ws_token(ws: WebSocket) -> Optional[str]:
    h = ws.headers.get("authorization", "")
    return h[7:] if h.startswith("Bearer ") else ws.query_params.get("token")


async def ws_stream(ws: WebSocket, build: Any, every: float = 1.0) -> None:
    """Push `build()` whenever it changes; also a heartbeat every 15 s so clients can detect dead links."""
    last, beat = "", 0.0
    try:
        while True:
            payload = await asyncio.to_thread(build)
            blob = json.dumps(payload, sort_keys=True, default=str)
            digest = hashlib.md5(blob.encode()).hexdigest()
            if digest != last or time.time() - beat > 15:
                await ws.send_text(blob if digest != last else json.dumps({"type": "ping"}))
                last, beat = digest, time.time()
            await asyncio.sleep(every)
    except (WebSocketDisconnect, RuntimeError):
        return


@app.websocket("/ws/vehicles/{vehicle_id}")
async def ws_vehicle(ws: WebSocket, vehicle_id: str) -> None:
    user = user_from_token(ws_token(ws))
    role = None
    if user:
        row = db.one("SELECT role FROM members WHERE vehicle_id=? AND user_id=? AND status='active'", vehicle_id, user.id)
        role = row["role"] if row else None
    if not user or role in (None, "school"):
        await ws.close(code=4401)
        return
    await ws.accept()

    def build() -> dict[str, Any]:
        s = status_json(vehicle_id, role)
        return {"type": "vehicle", "status": s, "location": location_json(vehicle_id)}
    await ws_stream(ws, build)


@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket) -> None:
    user = user_from_token(ws_token(ws))
    if not user:
        await ws.close(code=4401)
        return
    await ws.accept()
    await ws_stream(ws, lambda: {"type": "alerts", "alerts": alerts(user)})


# ---------------------------------------------------------------- production: vehicles, paired devices, pause, push

class VehicleIn(BaseModel):
    name: str = Field(min_length=1, max_length=40)
    model: str = Field("VinFast VF 8", min_length=1, max_length=40)
    plate: str = Field("", max_length=16)
    color: Literal["white", "black", "red"] = "white"


@app.post("/v1/vehicles")
def create_vehicle(body: VehicleIn, user: User = Depends(current_user)) -> dict[str, Any]:
    """The owner registers a vehicle. The in-car device is paired afterwards with a short-lived code."""
    if db.one("SELECT COUNT(*) AS n FROM members WHERE user_id=? AND role='owner'", user.id)["n"] >= 5:
        raise err(409, "too_many_vehicles", "Mỗi tài khoản chủ xe tối đa 5 xe.")
    vid = logic.new_id("veh")
    image = car_image(body.model)
    with db.tx() as conn:
        conn.execute("INSERT INTO vehicles(id,pair_code,model,plate,name,color,image) VALUES(?,?,?,?,?,?,?)",
                     (vid, "CS-" + secrets.token_hex(5).upper(), body.model.strip(), body.plate.strip().upper() or "Chưa nhập biển số",
                      body.name.strip(), body.color, image))
        conn.execute("INSERT INTO members(id,vehicle_id,user_id,phone,name,role,status,created_at) VALUES(?,?,?,?,?,?,?,?)",
                     (logic.new_id("mem"), vid, user.id, user.phone, user.name, "owner", "active", now()))
        base = logic.base_state()
        base.update({"connection": "offline", "last_seen": 0.0, "source": None, "temp_known": False, "lock_known": False, "outside_temp": None})
        logic.save_state(conn, vid, base)
        logic.add_event(conn, vid, None, "device", "Đã thêm xe", f"Chủ xe: {user.name}. Chưa có thiết bị trong xe.")
    return status_json(vid, "owner")


ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
PAIR_ATTEMPTS: dict[str, list[float]] = {}


def hash_secret(secret: str) -> str:
    return hashlib.sha256(secret.encode()).hexdigest()


class DeviceCodeOut(BaseModel):
    code: str
    expires_in: int


@app.post("/v1/vehicles/{vehicle_id}/devices/pairing")
def device_pairing_code(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner",), "ghép thiết bị trong xe")
    code = "".join(secrets.choice(ALPHABET) for _ in range(8))
    with db.tx() as conn:
        conn.execute("DELETE FROM device_codes WHERE vehicle_id=? OR expires_at<?", (vehicle_id, now()))
        conn.execute("INSERT INTO device_codes(code,vehicle_id,created_by,expires_at) VALUES(?,?,?,?)",
                     (code, vehicle_id, user.id, now() + config.DEVICE_CODE_TTL_S))
    return {"code": f"{code[:4]}-{code[4:]}", "expires_in": config.DEVICE_CODE_TTL_S}


class PairIn(BaseModel):
    code: str = Field(min_length=8, max_length=12)
    label: str = Field("Thiết bị trong xe", min_length=1, max_length=40)
    platform: str = Field("ios", max_length=20)


@app.post("/v1/device/pair")
def device_pair(body: PairIn, request: Request) -> dict[str, Any]:
    """Called by the in-car device with the code the owner generated. Returns a device token, shown only once."""
    ip = request.client.host if request.client else "?"
    recent = [t for t in PAIR_ATTEMPTS.get(ip, []) if now() - t < 600]
    if len(recent) >= 10:
        raise err(429, "pair_rate", "Nhập sai quá nhiều lần. Thử lại sau vài phút.")
    PAIR_ATTEMPTS[ip] = recent + [now()]
    code = body.code.replace("-", "").replace(" ", "").upper()
    row = db.one("SELECT * FROM device_codes WHERE code=?", code)
    if row is None or row["expires_at"] < now():
        raise err(400, "pair_code_wrong", "Mã ghép nối không đúng hoặc đã hết hạn. Tạo mã mới trong ứng dụng của chủ xe.")
    secret = secrets.token_urlsafe(32)
    did = logic.new_id("dev")
    with db.tx() as conn:
        conn.execute("DELETE FROM device_codes WHERE code=?", (code,))
        conn.execute("INSERT INTO devices(id,vehicle_id,secret_hash,label,platform,created_at) VALUES(?,?,?,?,?,?)",
                     (did, row["vehicle_id"], hash_secret(secret), body.label.strip(), body.platform, now()))
        logic.add_event(conn, row["vehicle_id"], None, "device", "Đã ghép thiết bị trong xe", f"{body.label.strip()} ({body.platform})")
        hist.audit(conn, None, body.label.strip(), "device.pair", vehicle_id=row["vehicle_id"], target=did, actor_role="device")
    PAIR_ATTEMPTS.pop(ip, None)
    return {"device_token": secret, "device_id": did, "vehicle": vehicle_row(row["vehicle_id"])}


def current_device(authorization: Optional[str] = Header(None)) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise err(401, "device_unauthorized", "Thiết bị chưa được ghép nối.")
    row = db.one("SELECT * FROM devices WHERE secret_hash=? AND revoked_at IS NULL", hash_secret(authorization[7:]))
    if row is None:
        raise err(401, "device_unauthorized", "Thiết bị đã bị ngắt hoặc chưa được ghép nối.")
    return dict(row)


class DeviceTelemetryIn(TelemetryIn):
    battery_pct: Optional[int] = Field(None, ge=0, le=100)
    charging: bool = False
    thermal: Optional[Literal["nominal", "fair", "serious", "critical"]] = None
    outside_temp: Optional[float] = Field(None, ge=-40, le=70)


@app.post("/v1/device/telemetry")
def device_telemetry(body: DeviceTelemetryIn, device: dict[str, Any] = Depends(current_device)) -> dict[str, Any]:
    vid = device["vehicle_id"]
    with db.tx() as conn:
        ingest_telemetry(conn, vid, body, "device")
        info = {"battery": body.battery_pct, "charging": body.charging, "thermal": body.thermal}
        conn.execute("UPDATE devices SET last_seen=?, info=? WHERE id=?", (now(), db.dumps(info), device["id"]))
        state = logic.load_state(vid)
        state["device"] = {"id": device["id"], "label": device["label"], "platform": device["platform"], "last_seen": now(), **info}
        logic.save_state(conn, vid, state)
        hist.record_heartbeat(conn, device["id"], device["platform"], body.battery_pct, body.charging, body.thermal)
    state = logic.load_state(vid)
    return {"ok": True, "server_time": now(), "vehicle": vehicle_row(vid),
            "paused_until": state.get("paused_until") if state.get("paused_until", 0) > now() else None}


@app.delete("/v1/device")
def device_unpair(device: dict[str, Any] = Depends(current_device)) -> dict[str, Any]:
    with db.tx() as conn:
        conn.execute("UPDATE devices SET revoked_at=? WHERE id=?", (now(), device["id"]))
        logic.add_event(conn, device["vehicle_id"], None, "device", "Thiết bị trong xe đã ngắt ghép nối", device["label"])
    return {"ok": True}


@app.get("/v1/vehicles/{vehicle_id}/devices")
def list_devices(vehicle_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner", "confirm"), "xem thiết bị trong xe")
    out = []
    for r in db.all_("SELECT * FROM devices WHERE vehicle_id=? AND revoked_at IS NULL ORDER BY created_at", vehicle_id):
        d = {k: r[k] for k in ("id", "label", "platform", "created_at", "last_seen")}
        d["info"] = db.loads(r["info"])
        d["online"] = bool(r["last_seen"]) and now() - r["last_seen"] <= logic.STALE_AFTER_S
        out.append(d)
    return out


@app.delete("/v1/vehicles/{vehicle_id}/devices/{device_id}")
def revoke_device(vehicle_id: str, device_id: str, user: User = Depends(current_user)) -> list[dict[str, Any]]:
    require(role_of(vehicle_id, user), ("owner",), "ngắt thiết bị trong xe")
    with db.tx() as conn:
        n = conn.execute("UPDATE devices SET revoked_at=? WHERE id=? AND vehicle_id=? AND revoked_at IS NULL", (now(), device_id, vehicle_id)).rowcount
        if n:
            logic.add_event(conn, vehicle_id, None, "device", "Chủ xe đã ngắt một thiết bị", user.name)
    if not n:
        raise err(404, "device_not_found", "Không tìm thấy thiết bị.")
    return list_devices(vehicle_id, user)


class PauseIn(BaseModel):
    minutes: int = Field(ge=1, le=config.PAUSE_MAX_MIN)


@app.post("/v1/vehicles/{vehicle_id}/pause")
def pause_monitoring(vehicle_id: str, body: PauseIn, user: User = Depends(current_user)) -> dict[str, Any]:
    """For when you sit in a parked car. Capped, always ends by itself, and impossible while an incident is open."""
    role = role_of(vehicle_id, user)
    require(role, ("owner", "confirm"), "tạm dừng giám sát")
    if logic.open_incident(vehicle_id) is not None:
        raise err(409, "incident_open", "Đang có sự cố mở. Xử lý sự cố trước, không thể tạm dừng giám sát.")
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        state["paused_until"] = now() + body.minutes * 60
        logic.save_state(conn, vehicle_id, state)
        logic.add_event(conn, vehicle_id, None, "pause", f"{user.name} tạm dừng giám sát {body.minutes} phút", "Tự giám sát lại khi hết giờ")
    return status_json(vehicle_id, role)


@app.delete("/v1/vehicles/{vehicle_id}/pause")
def resume_monitoring(vehicle_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    role = role_of(vehicle_id, user)
    require(role, ("owner", "confirm"), "bật lại giám sát")
    with db.tx() as conn:
        state = logic.load_state(vehicle_id)
        if state.pop("paused_until", None):
            logic.add_event(conn, vehicle_id, None, "pause", f"{user.name} bật lại giám sát", "")
        logic.save_state(conn, vehicle_id, state)
    return status_json(vehicle_id, role)


@app.get("/v1/me/push")
def my_push(user: User = Depends(current_user)) -> dict[str, Any]:
    topic = push.topic_for(user.id)
    host = config.NTFY_URL.split("://", 1)[-1]
    return {"server": config.NTFY_URL, "topic": topic, "subscribe_url": f"ntfy://{host}/{topic}", "web_url": f"{config.NTFY_URL}/{topic}"}


@app.post("/v1/me/push/test")
def my_push_test(user: User = Depends(current_user)) -> dict[str, Any]:
    ok = push.notify_user(user.id, "Thông báo thử CabinSentinel", "Nếu bạn thấy dòng này, cảnh báo sẽ tới được điện thoại này.", tags=["white_check_mark"])
    return {"sent": ok}


# ---------------------------------------------------------------- Telegram

@app.get("/v1/me/telegram")
def my_telegram(user: User = Depends(current_user)) -> dict[str, Any]:
    return {"configured": config.telegram_configured(), "linked": telegram.chat_for(user.id) is not None, "bot": telegram.bot_username()}


@app.post("/v1/me/telegram/link")
def my_telegram_link(user: User = Depends(current_user)) -> dict[str, Any]:
    if not config.telegram_configured():
        raise err(503, "telegram_unavailable", "Máy chủ chưa cấu hình bot Telegram.")
    return telegram.link_code(user.id)


@app.delete("/v1/me/telegram")
def my_telegram_unlink(user: User = Depends(current_user)) -> dict[str, Any]:
    telegram.unlink(user.id)
    return {"ok": True}


@app.post("/v1/me/telegram/test")
def my_telegram_test(user: User = Depends(current_user)) -> dict[str, Any]:
    chat = telegram.chat_for(user.id)
    if not chat:
        raise err(409, "telegram_not_linked", "Chưa liên kết Telegram.")
    return {"sent": telegram.notify(chat, "Thông báo thử Cabin Noir", "Nếu bạn thấy tin này, cảnh báo sẽ tới được Telegram.", False)}


@app.post("/v1/telegram/webhook/{secret}")
async def telegram_webhook(secret: str, request: Request) -> dict[str, Any]:
    if not config.TELEGRAM_WEBHOOK_SECRET or not secrets.compare_digest(secret, config.TELEGRAM_WEBHOOK_SECRET):
        raise err(404, "not_found", "Không tìm thấy.")
    await asyncio.to_thread(telegram.handle_update, await request.json())
    return {"ok": True}


# ---------------------------------------------------------------- web app (static, same origin as the API)

WEB_DIR = os.path.join(os.path.dirname(__file__), "..", "web")
if os.path.isdir(WEB_DIR):
    from fastapi.responses import RedirectResponse
    from fastapi.staticfiles import StaticFiles

    @app.get("/", include_in_schema=False)
    def root() -> RedirectResponse:
        return RedirectResponse("/app/")

    app.mount("/app", StaticFiles(directory=WEB_DIR, html=True), name="web")


# ---------------------------------------------------------------- history, audit, data rights

@app.get("/v1/vehicles/{vehicle_id}/observations")
def observations(vehicle_id: str, hours: int = 24, limit: int = 500, user: User = Depends(current_user)) -> dict[str, Any]:
    """Seat level history: how many people, pets and items the camera saw. Counts only, never images."""
    require(role_of(vehicle_id, user), ("owner", "confirm", "view"), "xem lịch sử cảm biến")
    since = now() - max(1, min(hours, 24 * 7)) * 3600
    rows = db.all_("SELECT ts,source,detector,camera_ok,people,children_hint,pets,items,cabin_temp,outside_temp,engine_on,seats_json FROM observations "
                   "WHERE vehicle_id=? AND ts>=? ORDER BY ts DESC LIMIT ?", vehicle_id, since, max(1, min(limit, 2000)))
    return {"retention_hours": int(hist.RETENTION["observations"] // 3600),
            "items": [{**{k: r[k] for k in r.keys() if k != "seats_json"}, "seats": db.loads(r["seats_json"])} for r in rows]}


@app.get("/v1/vehicles/{vehicle_id}/track")
def track(vehicle_id: str, hours: int = 6, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner", "confirm", "school"), "xem hành trình")
    since = now() - max(1, min(hours, 24 * 7)) * 3600
    rows = db.all_("SELECT ts,lat,lon,accuracy_m FROM locations WHERE vehicle_id=? AND ts>=? ORDER BY ts", vehicle_id, since)
    return {"retention_hours": int(hist.RETENTION["locations"] // 3600), "points": [dict(r) for r in rows]}


@app.get("/v1/vehicles/{vehicle_id}/audit")
def vehicle_audit(vehicle_id: str, limit: int = 100, user: User = Depends(current_user)) -> dict[str, Any]:
    require(role_of(vehicle_id, user), ("owner",), "xem nhật ký truy cập")
    rows = db.all_("SELECT ts,actor_name,action,target,outcome FROM audit_log WHERE vehicle_id=? ORDER BY id DESC LIMIT ?", vehicle_id, max(1, min(limit, 500)))
    return {"retention_days": int(hist.RETENTION["audit"] // 86400), "items": [dict(r) for r in rows]}


@app.get("/v1/me/export")
def export_me(user: User = Depends(current_user)) -> dict[str, Any]:
    return hist.export_user(user.id)


class DeleteMeIn(BaseModel):
    confirm: Literal["XOA TAI KHOAN"]


@app.delete("/v1/me")
def delete_me(body: DeleteMeIn, user: User = Depends(current_user)) -> dict[str, Any]:
    removed = hist.delete_account(user.id, MEDIA_DIR)
    return {"ok": True, **removed}


# ---------------------------------------------------------------- sessions

@app.get("/v1/me/sessions")
def my_sessions(authorization: str = Header(...), user: User = Depends(current_user)) -> list[dict[str, Any]]:
    mine = token_hash(authorization[7:])
    return [{"id": r["token_hash"][:16], "created_at": r["created_at"], "agent": r["agent"] or "", "current": r["token_hash"] == mine}
            for r in db.all_("SELECT token_hash,created_at,agent FROM tokens WHERE user_id=? ORDER BY created_at DESC", user.id)]


@app.delete("/v1/me/sessions/{session_id}")
def revoke_session(session_id: str, user: User = Depends(current_user)) -> dict[str, Any]:
    with db.tx() as conn:
        n = conn.execute("DELETE FROM tokens WHERE user_id=? AND substr(token_hash,1,16)=?", (user.id, session_id)).rowcount
    if not n:
        raise err(404, "session_not_found", "Không tìm thấy phiên đăng nhập.")
    return {"ok": True}


@app.post("/v1/auth/logout-all")
def logout_all(user: User = Depends(current_user)) -> dict[str, Any]:
    with db.tx() as conn:
        n = conn.execute("DELETE FROM tokens WHERE user_id=?", (user.id,)).rowcount
    return {"ok": True, "revoked": n}
