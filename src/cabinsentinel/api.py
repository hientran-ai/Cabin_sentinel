"""FastAPI boundary for Vision input and read-only owner dashboard data."""

import os
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException, Query

from src.cabinsentinel.models import VisionPayload
from src.cabinsentinel.service import CabinService

router = APIRouter(prefix="/api/v1", tags=["CabinSentinel"])


@lru_cache
def get_cabin_service() -> CabinService:
    return CabinService(os.getenv("CABINSENTINEL_DB_PATH", "data/cabinsentinel.db"))


@router.post("/vision")
def receive_vision(payload: VisionPayload, service: CabinService = Depends(get_cabin_service)) -> dict:
    try:
        return service.ingest_vision(payload)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


@router.get("/state/{vehicle_id}")
def read_state(vehicle_id: str, service: CabinService = Depends(get_cabin_service)) -> dict:
    state = service.get_state(vehicle_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Vehicle has no evaluated state")
    return state


@router.get("/risk/{vehicle_id}")
def read_risk(vehicle_id: str, service: CabinService = Depends(get_cabin_service)) -> dict:
    state = read_state(vehicle_id, service)
    return {
        key: state[key]
        for key in (
            "vehicle_id", "revision", "previous_risk_level", "risk_level",
            "rule_id", "reason", "actions", "action_results", "evaluated_at",
        )
    }


@router.get("/events/{vehicle_id}")
def read_events(
    vehicle_id: str, limit: int = Query(default=50, ge=1, le=500),
    service: CabinService = Depends(get_cabin_service),
) -> list[dict]:
    return service.events(vehicle_id, limit=limit)
