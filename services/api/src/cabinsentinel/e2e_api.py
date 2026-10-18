"""V1 end-to-end demo API: one session, one committed state, read by the cockpit and the owner phone.

Everything risk-related stays in CabinService. This module only (1) accepts inputs with explicit
provenance, (2) runs real inference on received frames, and (3) exposes committed state, history
and notification delivery. It never computes a risk level and accepts no label or risk field.
"""

import hashlib
import logging
import re
import sqlite3
import threading
import time
from collections import deque
from datetime import timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Literal

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, ConfigDict, Field
from starlette.concurrency import run_in_threadpool

from src.cabinsentinel import care, items, link
from src.cabinsentinel.actions import DemoActions
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.auth import authorize_session, session_bearer
from src.cabinsentinel.demo_api import age_classifier_status, validate_image_bytes
from src.cabinsentinel.models import VisionPayload
from src.cabinsentinel.service import CabinService
from src.cabinsentinel.vision_adapter import to_age_evidence, to_vision_payload
from src.config import get_settings

router = APIRouter(prefix="/api/v1/e2e", tags=["CabinSentinel E2E"])
protected = APIRouter(dependencies=[Depends(session_bearer)])
logger = logging.getLogger(__name__)

SIMULATION = {"vehicle_source": "SIMULATED", "action_mode": "SIMULATED", "vision_source": "MODEL_INFERENCE",
              "runtime": "HOSTED_SIMULATION"}
TTL_S = {"sensor": 5, "vision": 3}  # mirrors service._source_freshness; informational only
FRAME_ID = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
LABEL = re.compile(r"^[\w .()\-]{0,64}$")
MESSAGING_TOOLS = {"send_notification", "send_sms"}
SESSION_LIMIT_PER_MINUTE = 30
_session_times: deque[float] = deque()
_session_lock = threading.Lock()


@lru_cache(maxsize=4)
def _file_sha256(path: str, mtime_ns: int) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_provenance(request: Request) -> dict[str, Any]:
    """Describe the weights actually loaded; ``ready=false`` when inference is not available."""
    provider = getattr(request.app.state, "vision_provider", None)
    path = str(getattr(provider, "model_path", None) or get_settings().model_path or "")
    info: dict[str, Any] = {"ready": provider is not None, "framework": "ultralytics", "runtime": "pytorch-cpu",
                            "classes_used": ["person", "cat", "dog"], "item_classes": ["backpack", "cell phone"],
                            "items_tracking": bool(provider and getattr(provider, "supports_items", False)), "confidence_threshold": getattr(provider, "confidence", get_settings().model_confidence)}
    if getattr(provider, "framework", None):
        info["framework"] = provider.framework
        info["age_model"] = "cabin-age-repair-20261015.pt (MobileNetV3-Small)"
    if path and Path(path).is_file():
        stat = Path(path).stat()
        info.update(file=Path(path).name, size_bytes=stat.st_size, sha256=_file_sha256(path, stat.st_mtime_ns))
    try:
        import ultralytics

        info["ultralytics_version"] = ultralytics.__version__
    except Exception:  # version is informational; readiness is the provider
        pass
    info["age_classifier"] = getattr(provider, "age_status", "disabled") if provider is not None else "disabled"
    return info


def _vision_provider(request: Request):
    provider = getattr(request.app.state, "vision_provider", None)
    if provider is None:
        raise HTTPException(status_code=503, detail="Vision model unavailable")
    return provider


def _session(request: Request, service: CabinService, session_id: str) -> str:
    return authorize_session(request, service, session_id)


class SimulatedSensorInput(BaseModel):
    """Telemetry the simulator may send. There is deliberately no risk, rule, occupant or child field."""

    model_config = ConfigDict(extra="forbid")

    temperature: float = Field(ge=-40, le=85, allow_inf_nan=False)
    engine_status: Literal["ON", "OFF", "UNKNOWN"]
    doors_locked: bool
    radar_presence: bool
    driver_present: bool | None = None
    gear: Literal["P", "R", "N", "D", "UNKNOWN"] = "UNKNOWN"
    vehicle_speed_kph: float | None = Field(default=None, ge=0, le=300)
    hvac_status: Literal["ACTIVE", "INACTIVE", "FAULT", "UNKNOWN"] = "UNKNOWN"
    window_status: Literal["CLOSED", "VENTED", "OPEN", "UNKNOWN"] = "UNKNOWN"
    powertrain_type: Literal["EV", "ICE", "UNKNOWN"] = "UNKNOWN"
    operation_mode: Literal["NONE", "PET", "CAMP", "REMOTE_START", "UNKNOWN"] = "UNKNOWN"
    battery_soc_pct: float | None = Field(default=None, ge=0, le=100)
    trip_ended: bool | None = None  # optional demo analytics, excluded from safety SensorPayload


class ItemResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    response: Literal["TAKEN", "SNOOZE"]
    snooze_minutes: int | None = Field(default=None, ge=1, le=60)


class CameraStatusInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    frame_id: str = Field(pattern=FRAME_ID.pattern)
    status: Literal["BLOCKED", "ERROR", "DISCONNECTED", "NO_FEED"]
    capture_age_ms: float = Field(default=0, ge=0, le=60000)
    reason: str = Field(default="", max_length=120)
    origin: Literal["REAL_ADAPTER", "SIMULATED_FAULT"]


class IncidentRef(BaseModel):
    model_config = ConfigDict(extra="forbid")

    incident_id: str = Field(min_length=1, max_length=128)
    surface: Literal["PHONE", "COCKPIT"]


class ResolveInput(IncidentRef):
    revision: int = Field(ge=1)
    cabin_checked: Literal[True]


class CareDeclare(BaseModel):
    model_config = ConfigDict(extra="forbid")

    occupant: Literal["CHILD", "ADULT", "PET", "UNKNOWN"]
    surface: Literal["PHONE", "COCKPIT"]


class CareStart(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: Literal["CHILD", "ADULT", "PET", "UNKNOWN"] | None = None
    music: str | None = Field(default=None, max_length=24)
    surface: Literal["PHONE", "COCKPIT"]


class CareStop(BaseModel):
    model_config = ConfigDict(extra="forbid")

    surface: Literal["PHONE", "COCKPIT"]


class CareConsent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    auto_start: bool
    surface: Literal["PHONE", "COCKPIT"]


class LinkInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["DROP", "RESTORE"]


def _vehicle_writes_allowed(vehicle_id: str) -> None:
    """The simulated vehicle link of THIS session is down: vehicle writes are refused (not queued, not faked). Other sessions are unaffected."""
    if link.blocked(vehicle_id):
        raise HTTPException(status_code=409, detail="Vehicle link is down (simulated): update refused")


class FaultInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messaging_provider: Literal["OK", "FAIL"]


def _audit(service: CabinService, vehicle_id: str, event_type: str, payload: dict) -> None:
    service.record_event(vehicle_id, event_type, {"at": service.clock().isoformat(), **payload})


def _summary(state: dict | None) -> dict | None:
    if not state:
        return None
    keys = ("revision", "risk_level", "rule_id", "reason", "occupancy_state", "incident_id", "evaluated_at")
    return {key: state.get(key) for key in keys}


@router.get("/status")
def capabilities_status(request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """Unauthenticated readiness for the page: model readiness is separate from liveness and database."""
    model = model_provenance(request)
    return {
        "mode": "HOSTED_SIMULATION", "simulation": SIMULATION, "model": model, "ttl_s": TTL_S,
        "database": "ready" if service.database_ready() else "unavailable",
        "push_os": "PUSH_OS_NOT_VERIFIED", "oem": "OEM_NOT_VERIFIED",
        "upload_limit_bytes": get_settings().max_upload_size_bytes,
    }


@router.post("/sessions")
def create_session(service: CabinService = Depends(get_cabin_service)) -> dict:
    now = time.monotonic()
    with _session_lock:
        while _session_times and now - _session_times[0] > 60:
            _session_times.popleft()
        if len(_session_times) >= SESSION_LIMIT_PER_MINUTE:
            raise HTTPException(status_code=429, detail="Too many new demo sessions", headers={"Retry-After": "10"})
        _session_times.append(now)
    session_id, token = service.create_demo_session()
    return {"session_id": session_id, "session_token": token, "vehicle_id": f"DEMO_{session_id}",
            "simulation": SIMULATION}


@protected.post("/sessions/{session_id}/sensor")
def post_sensor(session_id: str, payload: SimulatedSensorInput, request: Request,
                service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    _vehicle_writes_allowed(vehicle_id)
    try:
        state = service.ingest_simulated_sensor(vehicle_id, payload.model_dump(exclude={"trip_ended"}))
        items.trip(service, vehicle_id, payload.trip_ended)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    link.accept(vehicle_id, "sensor", service.clock())
    return {"source": "SIMULATED", "committed": _summary(state)}


def _detections(frame: dict, vision: VisionPayload) -> list[dict]:
    return [
        {"class": item.class_name, "confidence": round(item.confidence, 4), **age}
        for item, age in zip(vision.detected_objects, to_age_evidence(frame), strict=True)
    ]


def _point_in_polygon(x: float, y: float, poly: list[list[float]]) -> bool:
    inside = False
    for (x1, y1), (x2, y2) in zip(poly, poly[1:] + poly[:1], strict=True):
        if (y1 > y) != (y2 > y) and x < (x2 - x1) * (y - y1) / (y2 - y1) + x1:
            inside = not inside
    return inside


def _demo_exterior_split(frame: dict, data: bytes) -> dict:
    """Demo calibration (DEMO-01/02 camera): a person whose box centre lies inside a window region is outside the cabin, not an occupant."""
    import json
    from io import BytesIO
    from pathlib import Path

    from PIL import Image

    detections = frame.get("detections") or []
    if not detections:
        return frame
    try:
        geometry = json.loads((Path(__file__).resolve().parent.parent / "vision" / "geometry" / "demo-wide-01.json").read_text())
        with Image.open(BytesIO(data)) as im:
            width, height = im.size
    except (OSError, ValueError):
        return frame
    inside, outside = [], []
    for detection in detections:
        box = detection.get("bbox")
        centred = isinstance(box, (list, tuple)) and len(box) == 4
        cx, cy = ((box[0] + box[2]) / 2 / width, (box[1] + box[3]) / 2 / height) if centred else (0.5, 0.5)
        in_window = detection.get("class") == "person" and any(_point_in_polygon(cx, cy, w) for w in geometry["windows"])
        (outside if in_window else inside).append(detection)
    if not outside:
        return frame
    return {**frame, "detections": inside, "exterior_count": int(frame.get("exterior_count") or 0) + len(outside)}


@protected.post("/sessions/{session_id}/observations")
async def post_observation(
    session_id: str, request: Request,
    image: UploadFile = File(...), frame_id: str = Form(...),
    capture_age_ms: float = Form(default=0, ge=0, le=60000),
    source: Literal["UPLOAD", "CLIP_FRAME", "DEVICE_CAMERA"] = Form(default="UPLOAD"),
    source_label: str = Form(default=""),
    media_time_s: float | None = Form(default=None, ge=0, le=36000),
    service: CabinService = Depends(get_cabin_service),
) -> dict:
    vehicle_id = _session(request, service, session_id)
    _vehicle_writes_allowed(vehicle_id)
    if not FRAME_ID.fullmatch(frame_id) or not LABEL.fullmatch(source_label):
        raise HTTPException(status_code=422, detail="Invalid frame_id or source_label")
    started = time.perf_counter()
    received_at = service.clock()
    replay = service.observation_get(vehicle_id, frame_id)
    if replay is not None:
        # A retry of an accepted frame: same answer, no inference, no revision, no repeated action.
        return {**replay, "replayed": True}
    provider = _vision_provider(request)
    data = await image.read(get_settings().max_upload_size_bytes + 1)
    validate_image_bytes(data, image.content_type)
    validated = time.perf_counter()
    try:
        # one tracker/age-smoothing stream per playback run (the client puts the run in the frame id: "<session>-r<run>-<n>-<ts>")
        run = frame_id.split("-")[1] if frame_id.count("-") >= 3 else "0"
        if getattr(provider, "supports_stream", False):
            # DEMO-01 / DEMO-02 were recorded by one camera whose cabin footprint is calibrated in vision/geometry (demo calibration only)
            camera = "DEMO-WIDE-01" if source_label.startswith(("DEMO-01", "DEMO-02")) else None
            frame = await run_in_threadpool(provider.infer, data, f"{vehicle_id}:{run}", camera)
        else:
            frame = await run_in_threadpool(provider.infer, data)
            if source_label.startswith(("DEMO-01", "DEMO-02")):
                frame = _demo_exterior_split(frame, data)   # same demo calibration as DEMO-WIDE-01, for providers without geometry support
    except Exception as exc:
        logger.exception("Vision inference failed")
        raise HTTPException(status_code=503, detail="Vision inference unavailable") from exc
    inferred = time.perf_counter()
    observed_at = received_at - timedelta(milliseconds=capture_age_ms)
    try:
        # The adapter keeps the detector's own fields; time is the frame's observation time, not "now".
        vision = to_vision_payload(
            {**frame, "timestamp": observed_at.isoformat(), "frame_id": 1},
            vehicle_id=vehicle_id, source_id=frame_id, camera_status="OK",
        )
        service.ingest_vision(vision)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except sqlite3.Error as exc:
        logger.exception("CabinService database unavailable")
        raise HTTPException(status_code=503, detail="CabinService unavailable") from exc
    committed = time.perf_counter()
    state = service.get_state(vehicle_id)
    accepted = service.vision_frame_committed(vehicle_id, vision.frame_id)
    link.accept(vehicle_id, "observation", service.clock())
    response = {
        "session_id": session_id, "frame_id": frame_id, "source": source, "source_label": source_label,
        "accepted": accepted, "replayed": False,
        "ignored_reason": None if accepted else "OUT_OF_ORDER_OR_SUPERSEDED",
        "observed_at": observed_at.isoformat(), "received_at": received_at.isoformat(),
        "capture_age_ms": capture_age_ms,
        "media_time_s": media_time_s,
        "vision": {"source": "MODEL_INFERENCE", "exterior_count": int(frame.get("exterior_count") or 0), "detections": _detections(frame, vision),
                   "items": items.sanitize(frame.get("item_detections")),
                   "age_classifier": age_classifier_status(frame)},
        "model": model_provenance(request),
        "timings_ms": {
            "validate": round((validated - started) * 1000, 2),
            "infer_detector": round(float(frame.get("detector_latency_ms", 0)), 2),
            "infer_total": round(float(frame.get("latency_ms", 0)), 2),
            "infer_wall": round((inferred - validated) * 1000, 2),
            "commit": round((committed - inferred) * 1000, 2),
            "server_total": round((committed - started) * 1000, 2),
        },
        "committed": _summary(state),
    }
    service.observation_put(vehicle_id, frame_id, response)
    _audit(service, vehicle_id, "observation", {k: response[k] for k in (
        "frame_id", "source", "source_label", "accepted", "ignored_reason", "observed_at", "received_at",
        "capture_age_ms", "media_time_s", "vision", "timings_ms")} | {"model": {k: response["model"].get(k) for k in ("file", "sha256", "ultralytics_version")}})
    if accepted:
        items.observe(service, vehicle_id)
    # The masked picture is for the caller to display once. It is NOT stored with the replay record or the audit log.
    preview = frame.get("preview")
    return {**response, "preview": preview} if isinstance(preview, dict) else response


@protected.post("/sessions/{session_id}/camera-status")
def post_camera_status(session_id: str, payload: CameraStatusInput, request: Request,
                       service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    _vehicle_writes_allowed(vehicle_id)
    replay = service.observation_get(vehicle_id, payload.frame_id)
    if replay is not None:
        return {**replay, "replayed": True}
    received_at = service.clock()
    observed_at = received_at - timedelta(milliseconds=payload.capture_age_ms)
    vision = VisionPayload(
        vehicle_id=vehicle_id, timestamp=observed_at, frame_id=f"status:{payload.frame_id}",
        camera_status=payload.status, detected_objects=[],
    )
    try:
        service.ingest_vision(vision)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    accepted = service.vision_frame_committed(vehicle_id, vision.frame_id)
    link.accept(vehicle_id, "camera_status", service.clock())
    response = {
        "session_id": session_id, "frame_id": payload.frame_id, "camera_status": payload.status,
        "origin": payload.origin, "reason": payload.reason, "accepted": accepted, "replayed": False,
        "observed_at": observed_at.isoformat(), "received_at": received_at.isoformat(),
        "committed": _summary(service.get_state(vehicle_id)),
    }
    service.observation_put(vehicle_id, payload.frame_id, response)
    _audit(service, vehicle_id, "camera_status", {k: response[k] for k in (
        "frame_id", "camera_status", "origin", "reason", "accepted", "observed_at", "received_at")})
    return response


def _last_observation(service: CabinService, vehicle_id: str) -> dict | None:
    rows = service.events(vehicle_id, event_type="observation", limit=1)
    status = service.events(vehicle_id, event_type="camera_status", limit=1)
    latest = max([*rows, *status], key=lambda event: event["event_id"], default=None)
    return latest


@protected.get("/sessions/{session_id}/state")
def read_state(session_id: str, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """Returns the committed decision with current source ages; never evaluates risk. Only Cabin Care transitions may write."""
    vehicle_id = _session(request, service, session_id)
    state = service.get_state_with_freshness(vehicle_id)
    if state is None:
        raise HTTPException(status_code=404, detail="Session has no evaluated state yet")
    care.tick(service, vehicle_id, state)  # the only write: lazy Cabin Care transitions (end with incident / pre-consented last resort)
    return {
        **state, "session_id": session_id, "care": care.view(service, vehicle_id, state), "simulation": SIMULATION, "ttl_s": TTL_S,
        "server_time": service.clock().isoformat(), "last_observation": _last_observation(service, vehicle_id),
        "model": model_provenance(request), "items": items.view(service, vehicle_id),
        "connectivity": link.view(vehicle_id, service.clock()),
    }


HISTORY_TYPES = {
    "alert", "action_intent", "action_attempt", "action_result", "acknowledgment", "incident_resolution",
    "unlock_request", "notification_delivery", "operator_action", "camera_status", "care", "demo_trip", "item_reminder", "item_response",
}


@protected.post("/sessions/{session_id}/items/{reminder_id}/respond")
def respond_to_item(session_id: str, reminder_id: str, payload: ItemResponse, request: Request,
                    service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    try:
        return items.respond(service, vehicle_id, reminder_id, payload.response, payload.snooze_minutes)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _history_item(event: dict, *, observations: bool = False) -> dict | None:
    kind = event["event_type"]
    if kind == "observation" and observations:
        return {"event_id": event["event_id"], "type": kind, "at": event.get("received_at"),
                **{k: v for k, v in event.items() if k not in {"event_id", "event_type"}}}
    if kind == "evaluation":
        if event.get("previous_risk_level") == event.get("risk_level") and event["revision"] != 1:
            return None
        return {"event_id": event["event_id"], "type": "risk_change", "at": event.get("evaluated_at"),
                **{k: event.get(k) for k in ("revision", "previous_risk_level", "risk_level", "rule_id", "reason",
                                              "occupancy_state", "incident_id")}}
    if kind not in HISTORY_TYPES:
        return None
    at = next((event.get(k) for k in ("at", "sent_at", "attempted_at", "created_at", "resolved_at", "acknowledged_at",
                                      "observed_at") if event.get(k)), None)
    return {"event_id": event["event_id"], "type": kind, "at": at,
            **{k: v for k, v in event.items() if k not in {"event_id", "event_type"}}}


@protected.get("/sessions/{session_id}/history")
def read_history(session_id: str, request: Request, after: int = Query(default=0, ge=0), limit: int = Query(default=100, ge=1, le=500),
                 observations: bool = Query(default=False), service: CabinService = Depends(get_cabin_service)) -> dict:
    """Meaningful events only. ``observations=true`` adds one row per frame (timings, detections) for evidence export."""
    vehicle_id = _session(request, service, session_id)
    raw = service.events_after(vehicle_id, after, limit=limit)
    items = [item for item in (_history_item(e, observations=observations) for e in raw) if item]
    return {"items": items, "next_after": raw[-1]["event_id"] if raw else after}


def _notifications(service: CabinService, vehicle_id: str, limit: int) -> list[dict]:
    alerts = service.events(vehicle_id, event_type="alert", limit=limit)
    delivered = {e["notification_id"]: e for e in service.events(vehicle_id, event_type="notification_delivery", limit=500)}
    attempts: dict[tuple[int, str], dict] = {}
    for event in reversed(service.events(vehicle_id, event_type="action_attempt", limit=500)):
        attempts[(event["revision"], event["tool"])] = event
    results = {(e["revision"], e["tool"]): e for e in reversed(service.events(vehicle_id, event_type="action_result", limit=500))}
    planned = {(e["revision"], e["tool"]) for e in service.events(vehicle_id, event_type="action_intent", limit=500)}
    items = []
    for alert in alerts:
        revision = alert["revision"]
        key = (revision, "send_notification")
        if key in results:
            outcome = results[key]["status"]
            push = {"state": "FAILED" if outcome == "failed" else "SIMULATED" if outcome == "simulated" else "UNKNOWN",
                    "adapter_status": outcome, "provider_accepted": False, "os_delivery": "PUSH_OS_NOT_VERIFIED"}
        elif key in attempts:
            push = {"state": "UNKNOWN", "adapter_status": None, "provider_accepted": False, "os_delivery": "PUSH_OS_NOT_VERIFIED"}
        elif key in planned:
            push = {"state": "PLANNED", "adapter_status": None, "provider_accepted": False, "os_delivery": "PUSH_OS_NOT_VERIFIED"}
        else:
            push = {"state": "NOT_PLANNED", "adapter_status": None, "provider_accepted": False, "os_delivery": "PUSH_OS_NOT_VERIFIED"}
        evaluation = service.evaluation_at(vehicle_id, revision) or {}
        confirmed = delivered.get(alert["event_id"])
        items.append({
            "notification_id": alert["event_id"], "incident_id": alert["incident_id"], "stage": alert["stage"],
            "sequence": alert["sequence"], "revision": revision, "sent_at": alert["sent_at"],
            "delivery_mode": alert["delivery_mode"],
            "risk_level": evaluation.get("risk_level"), "rule_id": evaluation.get("rule_id"), "reason": evaluation.get("reason"),
            "channels": {
                "in_app_feed": {"state": "IN_APP_DELIVERED" if confirmed else "PUBLISHED",
                                "delivered_at": confirmed["at"] if confirmed else None},
                "push": push,
            },
        })
    return items


@protected.get("/sessions/{session_id}/notifications")
def read_notifications(session_id: str, request: Request, limit: int = Query(default=50, ge=1, le=200),
                       service: CabinService = Depends(get_cabin_service)) -> list[dict]:
    return _notifications(service, _session(request, service, session_id), limit)


@protected.post("/sessions/{session_id}/notifications/{notification_id}/delivered")
def confirm_delivery(session_id: str, notification_id: int, request: Request,
                     service: CabinService = Depends(get_cabin_service)) -> dict:
    """The phone reports that it fetched and rendered this notification (in-app channel only)."""
    vehicle_id = _session(request, service, session_id)
    alerts = {e["event_id"] for e in service.events(vehicle_id, event_type="alert", limit=500)}
    if notification_id not in alerts:
        raise HTTPException(status_code=404, detail="Notification not found in this session")
    already = any(e["notification_id"] == notification_id
                  for e in service.events(vehicle_id, event_type="notification_delivery", limit=500))
    if not already:
        _audit(service, vehicle_id, "notification_delivery",
               {"notification_id": notification_id, "channel": "in_app_feed", "state": "IN_APP_DELIVERED"})
    return {"notification_id": notification_id, "state": "IN_APP_DELIVERED", "repeated": already}


@protected.post("/sessions/{session_id}/acknowledge")
def acknowledge(session_id: str, payload: IncidentRef, request: Request,
                service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    actor = {"surface": payload.surface, "authentication": "DEMO_SESSION_TOKEN"}
    try:
        state = service.acknowledge(vehicle_id, payload.incident_id)
    except ValueError as exc:
        _audit(service, vehicle_id, "operator_action", {"action": "acknowledge", "result": "REJECTED",
                                                        "incident_id": payload.incident_id, "reason": str(exc), "actor": actor})
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _audit(service, vehicle_id, "operator_action", {"action": "acknowledge", "result": "OK", "incident_id": payload.incident_id,
                                                    "revision": state["revision"], "actor": actor})
    return _summary(state) | {"incident": state["incident"]}


@protected.post("/sessions/{session_id}/resolve")
def resolve(session_id: str, payload: ResolveInput, request: Request,
            service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    actor = {"surface": payload.surface, "authentication": "DEMO_SESSION_TOKEN"}
    try:
        state = service.resolve(vehicle_id, payload.incident_id, payload.revision, cabin_checked=payload.cabin_checked)
    except ValueError as exc:
        _audit(service, vehicle_id, "operator_action", {
            "action": "resolve", "result": "REJECTED", "incident_id": payload.incident_id,
            "requested_revision": payload.revision, "reason": str(exc), "actor": actor})
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    _audit(service, vehicle_id, "operator_action", {
        "action": "resolve", "result": "OK", "incident_id": payload.incident_id, "revision": state["revision"],
        "requested_revision": payload.revision, "actor": actor})
    return _summary(state) | {"incident": state["incident"]}


def _care_call(service: CabinService, vehicle_id: str, surface: str, action: str, call) -> dict:
    actor = {"kind": "OWNER_PHONE" if surface == "PHONE" else "COCKPIT_OCCUPANT", "authentication": "DEMO_SESSION_TOKEN"}
    state = service.get_state_with_freshness(vehicle_id)
    try:
        result = call(state, actor)
    except ValueError as exc:
        _audit(service, vehicle_id, "operator_action", {"action": action, "result": "REJECTED", "reason": str(exc), "actor": actor})
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    return care.view(service, vehicle_id, service.get_state_with_freshness(vehicle_id)) | {"changed": action, "result_status": result["status"]}


@protected.post("/sessions/{session_id}/care/declare")
def care_declare(session_id: str, payload: CareDeclare, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """The person says who is inside. This never changes the risk level or the alert; it only picks the suggested comfort."""
    vehicle_id = _session(request, service, session_id)
    return _care_call(service, vehicle_id, payload.surface, "care_declare", lambda st, actor: care.declare(
        service, vehicle_id, st, occupant=payload.occupant, actor=actor))


@protected.post("/sessions/{session_id}/care/start")
def care_start(session_id: str, payload: CareStart, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    return _care_call(service, vehicle_id, payload.surface, "care_start", lambda st, actor: care.start(
        service, vehicle_id, st, profile=payload.profile, music=payload.music, actor=actor))


@protected.post("/sessions/{session_id}/care/stop")
def care_stop(session_id: str, payload: CareStop, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    vehicle_id = _session(request, service, session_id)
    return _care_call(service, vehicle_id, payload.surface, "care_stop", lambda st, actor: care.stop(service, vehicle_id, st, actor=actor))


@protected.post("/sessions/{session_id}/care/consent")
def care_consent(session_id: str, payload: CareConsent, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """Pre-consent for the last-resort auto start. Off means comfort only starts when a person asks."""
    vehicle_id = _session(request, service, session_id)
    return _care_call(service, vehicle_id, payload.surface, "care_consent", lambda st, actor: care.set_consent(
        service, vehicle_id, st, auto_start=payload.auto_start, actor=actor))


@protected.delete("/sessions/{session_id}")
def erase_session(session_id: str, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """Owner erasure: removes the session's telemetry, observations (detections only), events and credentials."""
    vehicle_id = _session(request, service, session_id)
    if isinstance(service.actions, DemoActions):
        service.actions.set_failing(vehicle_id, set())
    link.forget(vehicle_id)
    return {"deleted": service.delete_demo_session(vehicle_id)}


@protected.post("/sessions/{session_id}/link")
def set_link(session_id: str, payload: LinkInput, request: Request, service: CabinService = Depends(get_cabin_service)) -> dict:
    """Demo switch for ONE session: drop or restore the SIMULATED vehicle link. Never touches incidents, risk, other sessions or the service."""
    vehicle_id = _session(request, service, session_id)
    now = service.clock()
    view = link.drop(vehicle_id, now) if payload.action == "DROP" else link.restore(vehicle_id, now)
    _audit(service, vehicle_id, "operator_action", {"action": "vehicle_link_" + payload.action.lower(), "result": "OK", "state": view["state"]})
    return {"connectivity": view, "source": "SIMULATED"}


@protected.post("/sessions/{session_id}/faults")
def set_fault(session_id: str, payload: FaultInput, request: Request,
              service: CabinService = Depends(get_cabin_service)) -> dict:
    """Demo switch: make the SIMULATED messaging provider fail so the failure path can be observed."""
    vehicle_id = _session(request, service, session_id)
    if not isinstance(service.actions, DemoActions):
        raise HTTPException(status_code=501, detail="Fault injection is not available on this service")
    service.actions.set_failing(vehicle_id, MESSAGING_TOOLS if payload.messaging_provider == "FAIL" else set())
    _audit(service, vehicle_id, "operator_action", {"action": "set_fault", "result": "OK",
                                                    "messaging_provider": payload.messaging_provider})
    return {"messaging_provider": payload.messaging_provider, "source": "SIMULATED"}


router.include_router(protected)
