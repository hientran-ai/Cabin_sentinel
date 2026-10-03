"""FastAPI boundary for Vision input and read-only owner dashboard data."""

from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from src.cabinsentinel.auth import authorize_demo_vehicle, session_bearer
from src.cabinsentinel.models import VisionPayload
from src.cabinsentinel.service import CabinService
from src.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["CabinSentinel"], dependencies=[Depends(session_bearer)])


@lru_cache
def get_cabin_service() -> CabinService:
    return CabinService(get_settings().cabinsentinel_db_path)


def _authorize_fleet(request: Request, vehicle_id: str, *, write: bool) -> None:
    from src.cabinsentinel.fleet_api import authorize_registered_vehicle  # avoids an import cycle

    authorize_registered_vehicle(request, vehicle_id, write=write)


@router.post("/vision")
def receive_vision(payload: VisionPayload, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    authorize_demo_vehicle(request, service, payload.vehicle_id)
    _authorize_fleet(request, payload.vehicle_id, write=True)
    try:
        return service.ingest_vision(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/state/{vehicle_id}")
def read_state_endpoint(vehicle_id: str, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    authorize_demo_vehicle(request, service, vehicle_id)
    _authorize_fleet(request, vehicle_id, write=False)
    return read_state(vehicle_id, service)


def read_state(vehicle_id: str, service: CabinService) -> dict:
    state = service.get_state_with_freshness(vehicle_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Vehicle has no evaluated state")
    return state


@router.get("/risk/{vehicle_id}")
def read_risk(vehicle_id: str, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    authorize_demo_vehicle(request, service, vehicle_id)
    _authorize_fleet(request, vehicle_id, write=False)
    state = read_state(vehicle_id, service)
    return {
        key: state[key]
        for key in (
            "vehicle_id", "revision", "previous_risk_level", "risk_level",
            "rule_id", "reason", "actions", "action_results", "evaluated_at",
            "freshness", "decision_current", "incident_id", "incident",
            "alert", "data_quality", "ruleset_version",
        )
    }


@router.get("/events/{vehicle_id}")
def read_events(
    vehicle_id: str, request: Request, limit: int = Query(default=50, ge=1, le=500),
    service: CabinService = Depends(get_cabin_service),
) -> list[dict]:
    authorize_demo_vehicle(request, service, vehicle_id)
    _authorize_fleet(request, vehicle_id, write=False)
    return service.events(vehicle_id, limit=limit)
