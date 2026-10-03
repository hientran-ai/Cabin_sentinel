"""Owner, admin/fleet, guardian and device HTTP boundary.

Additive to the demo/camera API. Risk is always CabinService's committed verdict.
"""

import os
from functools import lru_cache
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPBearer
from pydantic import BaseModel, Field

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.fleet import AccessDeniedError, Fleet, Grant
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.config import get_settings

bearer = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/api/v1", tags=["CabinSentinel Fleet"], dependencies=[Depends(bearer)])


@lru_cache
def get_fleet() -> Fleet:
    fleet = Fleet(
        get_cabin_service(),
        device_token=os.environ.get("CABINSENTINEL_DEVICE_TOKEN") or None,
        device_source=os.environ.get("CABINSENTINEL_DEVICE_SOURCE", "SIMULATED"),
    )
    from src.cabinsentinel.platform_store import get_store
    get_store().attach(fleet)
    return fleet


def demo_login_enabled() -> bool:
    return get_settings().app_env != "production" and os.environ.get("CABINSENTINEL_DEMO_LOGIN", "true").lower() != "false"


def _token(request: Request) -> str | None:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    return token if scheme.lower() == "bearer" and token else None


def current_grant(request: Request, fleet: Fleet = Depends(get_fleet)) -> Grant:
    token = _token(request)
    if token is None:
        raise HTTPException(status_code=401, detail="Access token required")
    try:
        return fleet.resolve(token)
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc


def _guard(call):
    try:
        return call()
    except AccessDeniedError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def authorize_registered_vehicle(request: Request, vehicle_id: str, *, write: bool) -> None:
    """Close the legacy unauthenticated /state, /risk, /events and /vision routes for fleet ids."""
    fleet = get_fleet()
    if vehicle_id not in fleet.vehicles:
        return
    grant = current_grant(request, fleet)
    _guard(lambda: fleet.require_device(grant, vehicle_id) if write else fleet.require_view(grant, vehicle_id))


class DemoLoginInput(BaseModel):
    role: Literal["owner", "admin"]
    subject: str | None = Field(default=None, max_length=64)


@router.post("/auth/demo-login")
def demo_login(payload: DemoLoginInput, fleet: Fleet = Depends(get_fleet)) -> dict:
    """Development-only role login. Disabled when APP_ENV=production."""
    if not demo_login_enabled():
        raise HTTPException(status_code=404, detail="Demo login disabled")
    owners = sorted({v["owner"] for v in fleet.vehicles.values()})
    subject = "fleet-admin" if payload.role == "admin" else payload.subject or owners[0]
    if payload.role == "owner" and subject not in owners:
        raise HTTPException(status_code=422, detail="Unknown demo owner")
    token = fleet.issue(payload.role, subject)
    grant = fleet.resolve(token)
    return {"access_token": token, "role": grant.role, "subject": grant.subject,
            "expires_at": grant.expires_at.isoformat(), "owners": owners}


@router.get("/auth/me")
def who_am_i(grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    return {"role": grant.role, "subject": grant.subject, "trip_id": grant.trip_id,
            "vehicle_ids": fleet.visible(grant) if grant.role in {"owner", "admin", "operator", "caregiver"} else []}


@router.get("/vehicles")
def list_vehicles(grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    if grant.role not in {"owner", "admin", "operator", "caregiver"}:
        raise HTTPException(status_code=403, detail="Owner, caregiver, operator or admin access required")
    vehicles = [fleet.summary(vid) for vid in fleet.visible(grant)]
    return {"as_of": fleet.clock().isoformat(), "role": grant.role, "vehicles": vehicles}


@router.get("/vehicles/{vehicle_id}/state")
def vehicle_state(vehicle_id: str, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    _guard(lambda: fleet.require_view(grant, vehicle_id))
    return fleet.normalized_state(vehicle_id)


@router.get("/vehicles/{vehicle_id}/events")
def vehicle_events(
    vehicle_id: str, limit: int = Query(default=50, ge=1, le=500),
    grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet),
) -> dict:
    _guard(lambda: fleet.require_view(grant, vehicle_id))
    return {"vehicle_id": vehicle_id, "events": fleet.service.events(vehicle_id, limit=limit)}


def _ingest(fleet: Fleet, grant: Grant, vehicle_id: str, payload, ingest) -> dict:
    _guard(lambda: fleet.require_device(grant, vehicle_id))
    if payload.vehicle_id != vehicle_id:
        raise HTTPException(status_code=422, detail="Payload vehicle_id differs from the URL")
    before = fleet.service.get_state(vehicle_id)
    state = _guard(lambda: ingest(payload))
    fleet.note_source(vehicle_id, grant.source)
    if fleet.store is not None and state is not None:
        fleet.store.record_sample(vehicle_id, fleet.service.get_state_with_freshness(vehicle_id))
    accepted = state is not None and (before is None or state["revision"] != before["revision"])
    return {
        # Replayed sequences/frames return the committed state and run no actions.
        "result": "ACCEPTED" if accepted else "DUPLICATE_OR_STALE",
        "vehicle_id": vehicle_id,
        "revision": state["revision"] if state else None,
        "risk_level": state["risk_level"] if state else None,
        "actions": state.get("action_results", []) if accepted else [],
    }


@router.post("/vehicles/{vehicle_id}/sensors")
def ingest_sensor(vehicle_id: str, payload: SensorPayload, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    return _ingest(fleet, grant, vehicle_id, payload, fleet.service.ingest_sensor)


@router.post("/vehicles/{vehicle_id}/vision")
def ingest_vision(vehicle_id: str, payload: VisionPayload, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    return _ingest(fleet, grant, vehicle_id, payload, fleet.service.ingest_vision)


class TripInput(BaseModel):
    label: str | None = Field(default=None, max_length=80)


class TripEventInput(BaseModel):
    event: Literal["entered_vehicle", "exited_vehicle"]
    idempotency_key: str | None = Field(default=None, min_length=1, max_length=128)


@router.post("/vehicles/{vehicle_id}/trips")
def create_trip(vehicle_id: str, payload: TripInput, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    if grant.role not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="Owner or admin access required")
    return _guard(lambda: fleet.create_trip(grant, vehicle_id, payload.label))


@router.post("/trips/{trip_id}/events")
def trip_event(trip_id: str, payload: TripEventInput, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    if grant.role not in {"owner", "admin", "device"}:
        raise HTTPException(status_code=403, detail="Guardians can read trip status but not record events")
    return _guard(lambda: fleet.record_trip_event(grant, trip_id, payload.event, payload.idempotency_key))


@router.get("/guardian/trips/{trip_id}/child-status")
def child_status(trip_id: str, grant: Grant = Depends(current_grant), fleet: Fleet = Depends(get_fleet)) -> dict:
    return _guard(lambda: fleet.child_status(grant, trip_id))
