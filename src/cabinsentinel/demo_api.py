"""Synchronous V1 demo orchestration; risk stays in CabinService."""

import logging
import sqlite3
from io import BytesIO
from typing import Any, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, Field
from starlette.concurrency import run_in_threadpool

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.models import SensorPayload
from src.cabinsentinel.service import CabinService
from src.cabinsentinel.vision_adapter import to_vision_payload
from src.config import get_settings
from src.vision.provider import VisionProvider

router = APIRouter(prefix="/api/v1/demo", tags=["CabinSentinel Demo"])
logger = logging.getLogger(__name__)
IMAGE_TYPES = {"image/jpeg": "JPEG", "image/png": "PNG"}
SCENARIOS = {
    "normal": {
        "temperature": 25.0, "engine_status": "ON", "doors_locked": False,
        "driver_present": True, "gear": "D", "vehicle_speed_kph": 20.0,
        "hvac_status": "ACTIVE",
    },
    "parked_locked": {
        "temperature": 25.0, "engine_status": "OFF", "doors_locked": True,
        "driver_present": False, "gear": "P", "vehicle_speed_kph": 0.0,
        "hvac_status": "INACTIVE",
    },
    "hot_locked": {
        "temperature": 40.0, "engine_status": "OFF", "doors_locked": True,
        "driver_present": False, "gear": "P", "vehicle_speed_kph": 0.0,
        "hvac_status": "INACTIVE",
    },
}


class DemoDetection(BaseModel):
    class_name: str = Field(alias="class")
    confidence: float


class DemoVision(BaseModel):
    source: Literal["MODEL_INFERENCE"]
    detections: list[DemoDetection]
    latency_ms: float | None


class DemoVehicleState(SensorPayload):
    source: Literal["SIMULATED"]
    scenario: Literal["normal", "parked_locked", "hot_locked"]


class DemoReasoning(BaseModel):
    revision: int
    risk_level: str
    rule_id: str
    reason: str
    occupancy_state: str
    decision_current: bool
    freshness: dict[str, Any]


class DemoResponse(BaseModel):
    session_id: str
    vision: DemoVision
    vehicle_state: DemoVehicleState
    reasoning: DemoReasoning
    actions: list[dict[str, Any]]


def get_vision_provider(request: Request) -> VisionProvider:
    provider = getattr(request.app.state, "vision_provider", None)
    if provider is None:
        raise HTTPException(status_code=503, detail="Vision model unavailable")
    return provider


@router.post("/analyze", response_model=DemoResponse)
async def analyze_image(
    request: Request,
    image: UploadFile = File(...), scenario: str = Form(...),
    service: CabinService = Depends(get_cabin_service),
) -> dict:
    if scenario not in SCENARIOS:
        raise HTTPException(status_code=422, detail="Unsupported demo scenario")
    if image.content_type not in IMAGE_TYPES:
        raise HTTPException(status_code=415, detail="Only JPEG and PNG images are supported")
    image_data = await image.read(get_settings().max_upload_size_bytes + 1)
    if not image_data:
        raise HTTPException(status_code=422, detail="Image is empty")
    if len(image_data) > get_settings().max_upload_size_bytes:
        raise HTTPException(status_code=413, detail="Image exceeds upload limit")
    try:
        with Image.open(BytesIO(image_data)) as decoded:
            if decoded.format != IMAGE_TYPES[image.content_type]:
                raise HTTPException(status_code=422, detail="Image format and content type differ")
            if decoded.width * decoded.height > get_settings().max_image_pixels:
                raise HTTPException(status_code=413, detail="Image exceeds pixel limit")
            decoded.verify()
    except (Image.DecompressionBombError, UnidentifiedImageError, OSError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="Image cannot be decoded") from exc
    session_id = uuid4().hex
    vehicle_id = f"DEMO_{session_id}"
    provider = get_vision_provider(request)
    try:
        frame = await run_in_threadpool(provider.infer, image_data)
        vision = to_vision_payload(
            frame, vehicle_id=vehicle_id, source_id=session_id, camera_status="OK",
        )
    except Exception as exc:
        logger.exception("Vision inference or contract failed")
        raise HTTPException(status_code=503, detail="Vision inference unavailable") from exc
    try:
        sensor = SensorPayload(
            vehicle_id=vehicle_id, timestamp=service.clock(), sequence=1,
            radar_presence=False, **SCENARIOS[scenario],
        )
        service.ingest_sensor(sensor)
        state = service.ingest_vision(vision)
        current = service.get_state_with_freshness(vehicle_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        logger.exception("CabinService database unavailable")
        raise HTTPException(status_code=503, detail="CabinService unavailable") from exc
    if current is None:
        raise HTTPException(status_code=503, detail="CabinService state unavailable")
    return {
        "session_id": session_id,
        "vision": {
            "source": "MODEL_INFERENCE",
            "detections": [
                {"class": item.class_name, "confidence": item.confidence}
                for item in vision.detected_objects
            ],
            "latency_ms": vision.vision_latency_ms,
        },
        "vehicle_state": {**sensor.model_dump(mode="json"), "source": "SIMULATED", "scenario": scenario},
        "reasoning": {
            key: current[key]
            for key in (
                "revision", "risk_level", "rule_id", "reason",
                "occupancy_state", "decision_current", "freshness",
            )
        },
        "actions": state["action_results"],
    }
