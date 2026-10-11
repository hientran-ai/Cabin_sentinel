"""Owner, caregiver and device-facing platform API (accounts, vehicles, commands, evidence, incidents).

Operations/admin endpoints live in admin_api.py. Risk verdicts are never computed here.
"""

import secrets
import threading
import time
from datetime import UTC, datetime, timedelta
from io import BytesIO
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import Response as RawResponse
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field

from src.cabinsentinel.fleet import AccessDeniedError, Fleet, Grant
from src.cabinsentinel.fleet_api import current_grant, get_fleet
from src.cabinsentinel.platform_store import (
    ConflictError,
    NotFoundError,
    PlatformStore,
)
from src.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["CabinSentinel Platform"])
REFRESH_COOKIE, CSRF_COOKIE = "cs_refresh", "cs_csrf"
EmailStr = Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+\.[^@\s]+$")]
EVIDENCE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG"}


# -- shared helpers ------------------------------------------------------------
def get_platform(fleet: Fleet = Depends(get_fleet)) -> PlatformStore:
    if fleet.store is None:
        raise HTTPException(status_code=503, detail="Platform store unavailable")
    return fleet.store


def correlation_id(request: Request) -> str | None:
    return getattr(request.state, "correlation_id", None)


def audit(request: Request, store: PlatformStore, grant: Grant | None, action: str, target: str | None = None,
          outcome: str = "ok", actor: str | None = None, **detail) -> None:
    store.audit(grant, action, target=target, outcome=outcome, correlation_id=correlation_id(request), detail=detail, actor=actor)


def guard(call):
    """Translate domain errors to HTTP without leaking internals."""
    try:
        return call()
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ConflictError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def need(store: PlatformStore, grant: Grant, permission: str) -> None:
    if not store.can(grant, permission):
        raise HTTPException(status_code=403, detail=f"Permission required: {permission}")


def bearer_token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def account(store: PlatformStore, grant: Grant) -> dict:
    try:
        return store.user(grant.subject)
    except NotFoundError as exc:
        raise HTTPException(status_code=404, detail="This endpoint needs a persistent account (demo logins have none)") from exc


def vehicle_for(fleet: Fleet, grant: Grant, vehicle_id: str) -> dict:
    return guard(lambda: fleet.require_view(grant, vehicle_id))


def manage_vehicle(store: PlatformStore, fleet: Fleet, grant: Grant, vehicle_id: str) -> dict:
    need(store, grant, "vehicle.manage")
    vehicle = vehicle_for(fleet, grant, vehicle_id)
    if not store.is_dynamic_vehicle(vehicle_id):
        raise HTTPException(status_code=409, detail="Built-in demo vehicles are read-only")
    return vehicle


def cookies_secure() -> bool:
    return get_settings().app_env == "production"


# -- authentication -------------------------------------------------------------
class Credentials(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=256)
    use_cookie: bool = True


class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)
    full_name: str = Field(min_length=1, max_length=120)
    role: Literal["owner", "caregiver"] = "owner"
    language: Literal["vi", "en"] = "vi"


class RefreshInput(BaseModel):
    refresh_token: str | None = None


def _session_response(response: Response, user: dict, session: dict, use_cookie: bool) -> dict:
    body = {"user": user, "access_token": session["access_token"], "token_type": "bearer",
            "expires_at": session["expires_at"], "refresh_expires_at": session["refresh_expires_at"]}
    if use_cookie:
        csrf = secrets.token_urlsafe(24)
        common = {"secure": cookies_secure() or get_settings().cookie_samesite == "none", "samesite": get_settings().cookie_samesite, "max_age": int(timedelta(days=7).total_seconds())}
        response.set_cookie(REFRESH_COOKIE, session["refresh_token"], httponly=True, path="/api/v1/auth", **common)
        response.set_cookie(CSRF_COOKIE, csrf, httponly=False, path="/", **common)
        body["csrf_token"] = csrf
    else:
        body["refresh_token"] = session["refresh_token"]
    return body


@router.post("/auth/register", status_code=201)
def register(payload: RegisterInput, request: Request, store: PlatformStore = Depends(get_platform)) -> dict:
    if not get_settings().signup_enabled:
        raise HTTPException(status_code=403, detail="Self-service signup is disabled")
    def create():
        tenant = store.create_tenant(f"{payload.full_name} (personal)") if payload.role == "owner" else None
        return store.create_user(payload.email, payload.password, role=payload.role, full_name=payload.full_name,
                                 language=payload.language, tenant_id=tenant["tenant_id"] if tenant else None)
    user = guard(create)
    audit(request, store, None, "auth.register", user["user_id"], actor=user["user_id"], role=user["role"])
    return user


@router.post("/auth/login")
def login(payload: Credentials, request: Request, response: Response, store: PlatformStore = Depends(get_platform)) -> dict:
    try:
        user, session = store.login(payload.email, payload.password)
    except AccessDeniedError as exc:
        audit(request, store, None, "auth.login", payload.email.lower(), outcome="denied", actor=payload.email.lower())
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    audit(request, store, None, "auth.login", user["user_id"], actor=user["user_id"], role=user["role"])
    return _session_response(response, user, session, payload.use_cookie)


@router.post("/auth/refresh")
def refresh(request: Request, response: Response, payload: RefreshInput | None = None,
            store: PlatformStore = Depends(get_platform)) -> dict:
    cookie = request.cookies.get(REFRESH_COOKIE)
    token = payload.refresh_token if payload and payload.refresh_token else cookie
    use_cookie = bool(cookie) and not (payload and payload.refresh_token)
    if use_cookie:
        # Double-submit CSRF check; bearer/body-token clients are not exposed to CSRF.
        header = request.headers.get("X-CSRF-Token", "")
        if not header or not secrets.compare_digest(header, request.cookies.get(CSRF_COOKIE, "")):
            raise HTTPException(status_code=403, detail="CSRF token missing or invalid")
    if not token:
        raise HTTPException(status_code=401, detail="Refresh token required")
    try:
        user, session = store.refresh(token)
    except AccessDeniedError as exc:
        audit(request, store, None, "auth.refresh", outcome="denied")
        raise HTTPException(status_code=401, detail=str(exc)) from exc
    return _session_response(response, user, session, use_cookie)


@router.post("/auth/logout", status_code=204)
def logout(request: Request, response: Response, store: PlatformStore = Depends(get_platform)) -> Response:
    cookie = request.cookies.get(REFRESH_COOKIE)
    if cookie:
        header = request.headers.get("X-CSRF-Token", "")
        if not header or not secrets.compare_digest(header, request.cookies.get(CSRF_COOKIE, "")):
            raise HTTPException(status_code=403, detail="CSRF token missing or invalid")
    store.logout(access_token=bearer_token(request), refresh_token=cookie)
    audit(request, store, None, "auth.logout")
    out = Response(status_code=204)
    out.delete_cookie(REFRESH_COOKIE, path="/api/v1/auth")
    out.delete_cookie(CSRF_COOKIE, path="/")
    return out


@router.post("/auth/logout-all", status_code=204)
def logout_all(request: Request, grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> Response:
    account(store, grant)
    store.revoke_user_sessions(grant.subject)
    audit(request, store, grant, "auth.logout_all", grant.subject)
    return Response(status_code=204)


# -- profile / notifications / emergency contacts --------------------------------
class ProfileInput(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()-]{7,20}$")
    language: Literal["vi", "en"] | None = None


@router.get("/me/profile")
def read_profile(grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    return account(store, grant)


@router.put("/me/profile")
def update_profile(payload: ProfileInput, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    need(store, grant, "profile.manage")
    user = guard(lambda: store.update_profile(grant.subject, **payload.model_dump()))
    audit(request, store, grant, "profile.update", grant.subject, fields=sorted(payload.model_dump(exclude_none=True)))
    return user


class QuietHours(BaseModel):
    enabled: bool = False
    start: str = Field(default="22:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(default="07:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class NotificationInput(BaseModel):
    push: bool = True
    sms: bool = False
    email: bool = True
    quiet_hours: QuietHours = QuietHours()
    # CRITICAL alerts are never silenced by quiet hours unless the user explicitly opts out.
    critical_overrides_quiet_hours: bool = True


@router.get("/me/notification-settings")
def read_notifications(grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    return store.notification_settings(grant.subject)


@router.put("/me/notification-settings")
def save_notifications(payload: NotificationInput, request: Request, grant: Grant = Depends(current_grant),
                       store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    need(store, grant, "profile.manage")
    saved = store.save_notification_settings(grant.subject, payload.model_dump())
    audit(request, store, grant, "notification_settings.update", grant.subject)
    return saved


class ContactInput(BaseModel):
    full_name: str = Field(min_length=1, max_length=120)
    phone: str = Field(pattern=r"^\+?[0-9 ()-]{7,20}$")
    relationship: str | None = Field(default=None, max_length=60)


class ContactPatch(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    phone: str | None = Field(default=None, pattern=r"^\+?[0-9 ()-]{7,20}$")
    relationship: str | None = Field(default=None, max_length=60)


class VerifyInput(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")


@router.get("/me/emergency-contacts")
def list_contacts(grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    return {"contacts": store.emergency_contacts(grant.subject)}


@router.post("/me/emergency-contacts", status_code=201)
def add_contact(payload: ContactInput, request: Request, grant: Grant = Depends(current_grant),
                store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    need(store, grant, "profile.manage")
    contact = guard(lambda: store.add_emergency_contact(grant.subject, payload.full_name, payload.phone, payload.relationship))
    audit(request, store, grant, "emergency_contact.add", contact["contact_id"])
    return contact


@router.patch("/me/emergency-contacts/{contact_id}")
def patch_contact(contact_id: str, payload: ContactPatch, request: Request, grant: Grant = Depends(current_grant),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    need(store, grant, "profile.manage")
    contact = guard(lambda: store.update_emergency_contact(grant.subject, contact_id, **payload.model_dump()))
    audit(request, store, grant, "emergency_contact.update", contact_id)
    return contact


@router.delete("/me/emergency-contacts/{contact_id}", status_code=204)
def delete_contact(contact_id: str, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform)) -> Response:
    account(store, grant)
    need(store, grant, "profile.manage")
    guard(lambda: store.delete_emergency_contact(grant.subject, contact_id))
    audit(request, store, grant, "emergency_contact.delete", contact_id)
    return Response(status_code=204)


@router.post("/me/emergency-contacts/{contact_id}/verification")
def request_verification(contact_id: str, request: Request, grant: Grant = Depends(current_grant),
                         store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    need(store, grant, "profile.manage")
    code = guard(lambda: store.request_contact_verification(grant.subject, contact_id))
    audit(request, store, grant, "emergency_contact.verification_requested", contact_id)
    # No SMS gateway is wired: the code is only echoed outside production so the flow is testable.
    body = {"contact_id": contact_id, "delivery": "SMS_GATEWAY_NOT_CONFIGURED", "expires_in_seconds": 600}
    if get_settings().app_env != "production":
        body["dev_code"] = code
    return body


@router.post("/me/emergency-contacts/{contact_id}/verification/confirm")
def confirm_verification(contact_id: str, payload: VerifyInput, request: Request, grant: Grant = Depends(current_grant),
                         store: PlatformStore = Depends(get_platform)) -> dict:
    account(store, grant)
    contact = guard(lambda: store.confirm_contact_verification(grant.subject, contact_id, payload.code))
    audit(request, store, grant, "emergency_contact.verified", contact_id)
    return contact


# -- caregivers ------------------------------------------------------------------
class InviteInput(BaseModel):
    email: EmailStr
    vehicle_ids: list[str] = Field(min_length=1, max_length=50)
    can_acknowledge: bool = False


class LinkPatch(BaseModel):
    vehicle_ids: list[str] = Field(min_length=1, max_length=50)
    can_acknowledge: bool | None = None


class AcceptInput(BaseModel):
    token: str = Field(min_length=10, max_length=200)


def _own_vehicles(fleet: Fleet, grant: Grant, vehicle_ids: list[str]) -> None:
    for vid in vehicle_ids:
        vehicle = fleet.vehicles.get(vid)
        if vehicle is None or vehicle["owner"] != grant.subject:
            raise HTTPException(status_code=403, detail="Only your own vehicles can be shared")


@router.get("/me/caregivers")
def list_caregivers(grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "caregiver.manage")
    return {"caregivers": store.caregiver_links(grant.subject)}


@router.post("/me/caregivers/invites", status_code=201)
def invite_caregiver(payload: InviteInput, request: Request, grant: Grant = Depends(current_grant),
                     store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "caregiver.manage")
    _own_vehicles(fleet, grant, payload.vehicle_ids)
    link, token = store.invite_caregiver(grant.subject, payload.email, payload.vehicle_ids, payload.can_acknowledge)
    audit(request, store, grant, "caregiver.invite", link["link_id"], vehicles=payload.vehicle_ids)
    # No mailer is wired; the owner delivers the token. It is shown exactly once.
    return {**link, "invite_token": token}


@router.patch("/me/caregivers/{link_id}")
def assign_caregiver_vehicles(link_id: str, payload: LinkPatch, request: Request, grant: Grant = Depends(current_grant),
                              store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "caregiver.manage")
    _own_vehicles(fleet, grant, payload.vehicle_ids)
    link = guard(lambda: store.set_link_vehicles(grant.subject, link_id, payload.vehicle_ids, payload.can_acknowledge))
    audit(request, store, grant, "caregiver.assign", link_id, vehicles=payload.vehicle_ids)
    return link


@router.delete("/me/caregivers/{link_id}", status_code=204)
def revoke_caregiver(link_id: str, request: Request, grant: Grant = Depends(current_grant),
                     store: PlatformStore = Depends(get_platform)) -> Response:
    need(store, grant, "caregiver.manage")
    guard(lambda: store.revoke_caregiver(grant.subject, link_id))
    audit(request, store, grant, "caregiver.revoke", link_id)
    return Response(status_code=204)


@router.post("/caregiver-invites/accept")
def accept_invite(payload: AcceptInput, request: Request, grant: Grant = Depends(current_grant),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    user = account(store, grant)
    link = guard(lambda: store.accept_invite(user, payload.token))
    audit(request, store, grant, "caregiver.accept", link["link_id"])
    return link


# -- vehicles, claim, pairing ------------------------------------------------------
class VehicleInput(BaseModel):
    vehicle_id: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{3,64}$")
    name: str = Field(min_length=1, max_length=80)
    plate: str | None = Field(default=None, max_length=20)
    model: str | None = Field(default=None, max_length=80)
    owner_id: str | None = None
    tenant_id: str | None = None


class VehiclePatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    plate: str | None = Field(default=None, max_length=20)
    model: str | None = Field(default=None, max_length=80)
    owner_id: str | None = None
    tenant_id: str | None = None


class ClaimInput(BaseModel):
    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{3,64}$")
    claim_code: str = Field(min_length=6, max_length=64)


@router.post("/vehicles", status_code=201)
def create_vehicle(payload: VehicleInput, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "vehicle.manage")
    if grant.role == "owner":
        owner_id, tenant_id = grant.subject, grant.tenant_id
        if payload.owner_id not in {None, grant.subject}:
            raise HTTPException(status_code=403, detail="Owners can only add vehicles to their own account")
    else:
        owner_id, tenant_id = payload.owner_id, payload.tenant_id or grant.tenant_id
        if grant.tenant_id and tenant_id != grant.tenant_id:
            raise HTTPException(status_code=403, detail="Vehicle must belong to your tenant")
    vehicle, claim = guard(lambda: store.create_vehicle(
        vehicle_id=payload.vehicle_id, name=payload.name, plate=payload.plate, model=payload.model,
        owner_id=owner_id, tenant_id=tenant_id))
    audit(request, store, grant, "vehicle.create", vehicle["vehicle_id"], owner=owner_id)
    return {**vehicle, **({"claim_code": claim} if claim else {})}


@router.post("/vehicles/claim")
def claim_vehicle(payload: ClaimInput, request: Request, grant: Grant = Depends(current_grant),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    if grant.role != "owner":
        raise HTTPException(status_code=403, detail="Only owners can claim a vehicle")
    try:
        vehicle = store.claim_vehicle(payload.vehicle_id, payload.claim_code, grant.subject, grant.tenant_id)
    except ValueError as exc:
        audit(request, store, grant, "vehicle.claim", payload.vehicle_id, outcome="denied")
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(request, store, grant, "vehicle.claim", payload.vehicle_id)
    return vehicle


@router.patch("/vehicles/{vehicle_id}")
def update_vehicle(vehicle_id: str, payload: VehiclePatch, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    manage_vehicle(store, fleet, grant, vehicle_id)
    changes = payload.model_dump(exclude_none=True)
    if grant.role == "owner" and {"owner_id", "tenant_id"} & changes.keys():
        raise HTTPException(status_code=403, detail="Only administrators can reassign ownership")
    if grant.tenant_id and changes.get("tenant_id") not in {None, grant.tenant_id}:
        raise HTTPException(status_code=403, detail="Vehicle must belong to your tenant")
    vehicle = guard(lambda: store.update_vehicle(vehicle_id, **changes))
    audit(request, store, grant, "vehicle.update", vehicle_id, fields=sorted(changes))
    return vehicle


@router.delete("/vehicles/{vehicle_id}")
def retire_vehicle(vehicle_id: str, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    manage_vehicle(store, fleet, grant, vehicle_id)
    vehicle = guard(lambda: store.retire_vehicle(vehicle_id))
    audit(request, store, grant, "vehicle.retire", vehicle_id)
    return vehicle


@router.post("/vehicles/{vehicle_id}/pairing-code", status_code=201)
def pairing_code(vehicle_id: str, request: Request, grant: Grant = Depends(current_grant),
                 store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    manage_vehicle(store, fleet, grant, vehicle_id)
    code = guard(lambda: store.issue_pairing_code(vehicle_id))
    audit(request, store, grant, "device.pairing_code", vehicle_id)
    return code


class PairInput(BaseModel):
    pairing_code: str = Field(min_length=4, max_length=32)
    serial: str = Field(min_length=3, max_length=64)
    firmware: str | None = Field(default=None, max_length=40)


_pair_failures: list[float] = []
_pair_lock = threading.Lock()


@router.post("/devices/pair", status_code=201)
def pair_device(payload: PairInput, request: Request, store: PlatformStore = Depends(get_platform)) -> dict:
    now = time.monotonic()
    with _pair_lock:
        _pair_failures[:] = [t for t in _pair_failures if now - t < 300]
        if len(_pair_failures) >= 10:
            raise HTTPException(status_code=429, detail="Too many failed pairing attempts; retry later")
    try:
        paired = store.pair_device(payload.pairing_code, payload.serial, payload.firmware)
    except ValueError as exc:
        with _pair_lock:
            _pair_failures.append(now)
        audit(request, store, None, "device.pair", outcome="denied", actor=f"serial:{payload.serial}")
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    audit(request, store, None, "device.pair", paired["device_id"], actor=f"serial:{payload.serial}", vehicle=paired["vehicle_id"])
    return paired


# -- device channel ----------------------------------------------------------------
def device_grant(grant: Grant = Depends(current_grant)) -> Grant:
    if grant.role != "device" or not grant.vehicle_id:
        raise HTTPException(status_code=403, detail="A paired device credential is required")
    return grant


class HeartbeatInput(BaseModel):
    firmware: str | None = Field(default=None, max_length=40)
    battery_pct: float | None = Field(default=None, ge=0, le=100)
    rssi_dbm: float | None = Field(default=None, ge=-150, le=0)
    status: Literal["OK", "DEGRADED", "ERROR"] | None = "OK"


@router.post("/device/heartbeat")
def device_heartbeat(payload: HeartbeatInput, grant: Grant = Depends(device_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    return store.heartbeat(grant.subject.removeprefix("device:"), **payload.model_dump())


@router.get("/device/commands")
def device_commands(grant: Grant = Depends(device_grant), store: PlatformStore = Depends(get_platform)) -> dict:
    return {"commands": store.pull_device_commands(grant.vehicle_id)}


class AckInput(BaseModel):
    ok: bool
    detail: str | None = Field(default=None, max_length=200)


@router.post("/device/commands/{command_id}/ack")
def device_ack(command_id: str, payload: AckInput, request: Request, grant: Grant = Depends(device_grant),
               store: PlatformStore = Depends(get_platform)) -> dict:
    command = guard(lambda: store.ack_command(command_id, grant.vehicle_id, payload.ok, payload.detail))
    audit(request, store, grant, "command.device_ack", command_id, status=command["status"])
    return command


# -- telemetry / live / evidence ------------------------------------------------------
@router.get("/vehicles/{vehicle_id}/telemetry")
def telemetry(vehicle_id: str, minutes: int = Query(default=30, ge=1, le=1440), bucket_seconds: int = Query(default=30, ge=5, le=3600),
              grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    need(store, grant, "vehicle.read")
    return store.telemetry(vehicle_id, minutes, bucket_seconds)


@router.post("/vehicles/{vehicle_id}/live-sessions", status_code=201)
def start_live(vehicle_id: str, request: Request, grant: Grant = Depends(current_grant),
               store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    need(store, grant, "vehicle.read")
    session = store.create_live_session(vehicle_id, grant.subject, timedelta(minutes=5))
    audit(request, store, grant, "live.start", vehicle_id)
    return {**session, "transport": "METADATA_POLL", "stream": None, "raw_frames": False,
            "poll_url": f"/api/v1/live-sessions/{session['live_session_id']}", "poll_interval_ms": 1000,
            "privacy": "Detection metadata only; no raw image or video is ever served."}


@router.get("/live-sessions/{live_id}")
def read_live(live_id: str, grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform),
              fleet: Fleet = Depends(get_fleet)) -> dict:
    row = guard(lambda: store.live_session(live_id))
    if row["user_id"] != grant.subject:
        raise HTTPException(status_code=404, detail="Live session not found or expired")
    vehicle_for(fleet, grant, row["vehicle_id"])  # re-check: access may have been revoked mid-session
    state = fleet.normalized_state(row["vehicle_id"])
    return {"live_session_id": live_id, "vehicle_id": row["vehicle_id"], "expires_at": row["expires_at"],
            "vision": state["vision"], "risk": state["risk"], "data_quality": state["data_quality"], "as_of": state["as_of"]}


@router.delete("/live-sessions/{live_id}", status_code=204)
def end_live(live_id: str, grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform)) -> Response:
    row = guard(lambda: store.live_session(live_id))
    if row["user_id"] == grant.subject:
        store.end_live_session(live_id)
    return Response(status_code=204)


@router.post("/vehicles/{vehicle_id}/evidence", status_code=201)
async def upload_evidence(vehicle_id: str, request: Request, image: UploadFile = File(...),
                          privacy_processed: bool = Form(...), incident_id: str | None = Form(default=None),
                          grant: Grant = Depends(device_grant), store: PlatformStore = Depends(get_platform),
                          fleet: Fleet = Depends(get_fleet)) -> dict:
    """Device-only. The device must upload an already blurred snapshot and attest it; raw frames are refused."""
    guard(lambda: fleet.require_device(grant, vehicle_id))
    settings = get_settings()
    if not privacy_processed:
        raise HTTPException(status_code=422, detail="Only privacy-processed (blurred) snapshots are accepted")
    if image.content_type not in EVIDENCE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG and PNG snapshots are supported")
    data = await image.read(settings.evidence_max_bytes + 1)
    if not data or len(data) > settings.evidence_max_bytes:
        raise HTTPException(status_code=413 if data else 422, detail="Snapshot empty or too large")
    try:
        with Image.open(BytesIO(data)) as decoded:
            if decoded.format != EVIDENCE_TYPES[image.content_type] or decoded.width * decoded.height > settings.max_image_pixels:
                raise HTTPException(status_code=422, detail="Snapshot format or size not acceptable")
            decoded.verify()
    except (UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Snapshot cannot be decoded") from exc
    meta = store.save_evidence(vehicle_id, incident_id, image.content_type, data, grant.subject,
                               timedelta(hours=settings.evidence_retention_hours))
    audit(request, store, grant, "evidence.upload", meta["evidence_id"], vehicle=vehicle_id)
    return meta


@router.get("/vehicles/{vehicle_id}/evidence")
def list_evidence(vehicle_id: str, incident_id: str | None = None, grant: Grant = Depends(current_grant),
                  store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    need(store, grant, "vehicle.read")
    return {"evidence": store.evidence_list(vehicle_id, incident_id)}


@router.post("/evidence/{evidence_id}/signed-url")
def evidence_url(evidence_id: str, request: Request, ttl_seconds: int = Query(default=120, ge=10, le=300),
                 grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform),
                 fleet: Fleet = Depends(get_fleet)) -> dict:
    meta = guard(lambda: store.evidence_meta(evidence_id))
    vehicle_for(fleet, grant, meta["vehicle_id"])
    need(store, grant, "vehicle.read")
    signed = store.sign(evidence_id, ttl_seconds)
    audit(request, store, grant, "evidence.signed_url", evidence_id, vehicle=meta["vehicle_id"])
    return {"evidence_id": evidence_id, "expires_at": datetime.fromtimestamp(signed["expires"], UTC).isoformat(),
            "url": f"/api/v1/evidence/{evidence_id}/content?expires={signed['expires']}&signature={signed['signature']}"}


@router.get("/evidence/{evidence_id}/content")
def evidence_content(evidence_id: str, expires: int, signature: str, store: PlatformStore = Depends(get_platform)) -> RawResponse:
    if not store.verify_signature(evidence_id, expires, signature):
        raise HTTPException(status_code=403, detail="Signed URL is invalid or expired")
    meta, blob = guard(lambda: store.evidence_blob(evidence_id))
    return RawResponse(blob, media_type=meta["content_type"], headers={"Cache-Control": "no-store", "Content-Disposition": "inline"})


# -- incidents ----------------------------------------------------------------------
class HoldInput(BaseModel):
    keep_active: bool
    version: int = Field(ge=0)
    note: str | None = Field(default=None, max_length=300)


class ResolveInput(BaseModel):
    revision: int = Field(ge=1)
    cabin_checked: Literal[True]


def _incident_view(fleet: Fleet, store: PlatformStore, vehicle_id: str) -> dict | None:
    state = fleet.service.get_state_with_freshness(vehicle_id)
    incident = state.get("incident") if state else None
    if not incident:
        return None
    return {**incident, "vehicle_id": vehicle_id, "revision": state["revision"], "risk_level": state["risk_level"],
            "ops": store.incident_ops(incident["incident_id"], vehicle_id)}


@router.get("/vehicles/{vehicle_id}/incidents")
def vehicle_incidents(vehicle_id: str, grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform),
                      fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    need(store, grant, "vehicle.read")
    history = [e for e in fleet.service.events(vehicle_id, event_type="incident_resolution", limit=50)]
    return {"vehicle_id": vehicle_id, "current": _incident_view(fleet, store, vehicle_id), "resolved_history": history}


def _incident_actor(store: PlatformStore, grant: Grant, vehicle_id: str, *, manage: bool) -> None:
    if grant.role == "caregiver":
        if manage or not store.caregiver_can_acknowledge(grant.subject, vehicle_id):
            raise HTTPException(status_code=403, detail="Caregiver is not allowed to act on incidents")
        return
    need(store, grant, "incident.manage" if manage else "incident.ack")


@router.post("/vehicles/{vehicle_id}/incidents/{incident_id}/acknowledge")
def acknowledge_incident(vehicle_id: str, incident_id: str, request: Request, grant: Grant = Depends(current_grant),
                         store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    _incident_actor(store, grant, vehicle_id, manage=False)
    guard(lambda: fleet.service.acknowledge(vehicle_id, incident_id))
    audit(request, store, grant, "incident.acknowledge", incident_id, vehicle=vehicle_id)
    return _incident_view(fleet, store, vehicle_id)


@router.post("/vehicles/{vehicle_id}/incidents/{incident_id}/hold")
def hold_incident(vehicle_id: str, incident_id: str, payload: HoldInput, request: Request, grant: Grant = Depends(current_grant),
                  store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    """Keep the alert active: blocks the cabin-check resolve until released. Never lowers risk."""
    vehicle_for(fleet, grant, vehicle_id)
    _incident_actor(store, grant, vehicle_id, manage=True)
    view = _incident_view(fleet, store, vehicle_id)
    if not view or view["incident_id"] != incident_id or view["status"] != "OPEN":
        raise HTTPException(status_code=409, detail="Incident is not current and open")
    guard(lambda: store.update_incident_ops(incident_id, vehicle_id, payload.version, actor=grant.subject,
                                            keep_active=payload.keep_active, note=payload.note))
    audit(request, store, grant, "incident.hold", incident_id, vehicle=vehicle_id, keep_active=payload.keep_active)
    return _incident_view(fleet, store, vehicle_id)


@router.post("/vehicles/{vehicle_id}/incidents/{incident_id}/resolve")
def resolve_incident(vehicle_id: str, incident_id: str, payload: ResolveInput, request: Request,
                     grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform),
                     fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    _incident_actor(store, grant, vehicle_id, manage=True)
    if store.incident_ops(incident_id, vehicle_id)["keep_active"]:
        raise HTTPException(status_code=409, detail="Incident is held active; release the hold first")
    guard(lambda: fleet.service.resolve(vehicle_id, incident_id, payload.revision))
    store.update_incident_ops(incident_id, vehicle_id, store.incident_ops(incident_id, vehicle_id)["version"],
                              actor=grant.subject, ops_status="RESOLVED")
    audit(request, store, grant, "incident.resolve", incident_id, vehicle=vehicle_id, revision=payload.revision)
    return _incident_view(fleet, store, vehicle_id)


# -- reactive commands -----------------------------------------------------------------
class CommandInput(BaseModel):
    type: Literal["horn", "sms", "unlock"]
    incident_id: str | None = Field(default=None, max_length=128)


def _commands_unlocked() -> None:
    if not get_settings().commands_enabled:
        raise HTTPException(status_code=423, detail="Remote commands are disabled on this deployment")


def _command_vehicle(fleet: Fleet, store: PlatformStore, grant: Grant, command_id: str) -> dict:
    command = guard(lambda: store.get_command(command_id))
    vehicle_for(fleet, grant, command["vehicle_id"])
    return command


@router.post("/vehicles/{vehicle_id}/commands", status_code=201)
def request_command(vehicle_id: str, payload: CommandInput, request: Request, grant: Grant = Depends(current_grant),
                    store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    _commands_unlocked()
    vehicle_for(fleet, grant, vehicle_id)
    need(store, grant, "command.request")
    if payload.type == "unlock":
        state = fleet.service.get_state_with_freshness(vehicle_id)
        if not state or state["risk_level"] != "CRITICAL" or not state["decision_current"]:
            raise HTTPException(status_code=409, detail="Unlock requires a current CRITICAL decision")
    if payload.type == "sms" and not any(c["verified"] for c in store.emergency_contacts(fleet.vehicles[vehicle_id]["owner"] or "")):
        raise HTTPException(status_code=409, detail="SMS needs a verified emergency contact")
    command = guard(lambda: store.request_command(vehicle_id, payload.type, grant.subject, payload.incident_id))
    audit(request, store, grant, "command.request", command["command_id"], vehicle=vehicle_id, type=payload.type)
    return command


@router.post("/commands/{command_id}/confirm")
def confirm_command(command_id: str, request: Request, grant: Grant = Depends(current_grant),
                    store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    _commands_unlocked()
    command = _command_vehicle(fleet, store, grant, command_id)
    need(store, grant, "command.request")
    owner = fleet.vehicles[command["vehicle_id"]]["owner"]
    if command["type"] == "unlock":
        state = fleet.service.get_state_with_freshness(command["vehicle_id"])
        if not state or state["risk_level"] != "CRITICAL" or not state["decision_current"]:
            raise HTTPException(status_code=409, detail="Unlock requires a current CRITICAL decision")
    # Unlock requested by anyone but the owner needs a second person to authorize it.
    four_eyes = command["type"] == "unlock" and command["requested_by"] != owner
    result = guard(lambda: store.authorize_command(command_id, grant.subject, four_eyes=four_eyes))
    audit(request, store, grant, "command.authorize", command_id, vehicle=command["vehicle_id"], type=command["type"])
    return result


@router.post("/commands/{command_id}/cancel")
def cancel_command(command_id: str, request: Request, grant: Grant = Depends(current_grant),
                   store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    command = _command_vehicle(fleet, store, grant, command_id)
    need(store, grant, "command.request")
    result = guard(lambda: store.cancel_command(command_id, grant.subject))
    audit(request, store, grant, "command.cancel", command_id, vehicle=command["vehicle_id"])
    return result


@router.get("/commands/{command_id}")
def read_command(command_id: str, grant: Grant = Depends(current_grant), store: PlatformStore = Depends(get_platform),
                 fleet: Fleet = Depends(get_fleet)) -> dict:
    return _command_vehicle(fleet, store, grant, command_id)


@router.get("/vehicles/{vehicle_id}/commands")
def vehicle_commands(vehicle_id: str, limit: int = Query(default=50, ge=1, le=200), grant: Grant = Depends(current_grant),
                     store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    vehicle_for(fleet, grant, vehicle_id)
    return {"commands": store.commands([vehicle_id], limit)}

