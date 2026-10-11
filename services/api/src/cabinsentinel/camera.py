"""Authenticated camera frame sessions for the HF demo, without hardware claims."""

import hashlib
import math
import threading
from dataclasses import dataclass, field
from datetime import datetime
from io import BytesIO
from uuid import uuid4

from PIL import Image

from src.cabinsentinel.demo_api import SCENARIOS
from src.cabinsentinel.models import VisionPayload
from src.cabinsentinel.vision_adapter import to_age_evidence, to_vision_payload
from src.config import get_settings


class CameraError(ValueError):
    def __init__(self, code, message):
        self.code = code
        self.message = message
        super().__init__(f"{code}: {message}")


@dataclass
class _Session:
    scenario: str
    source: str
    observed_at: datetime
    requested: str = "RUNNING"
    device_reported: str = "UNKNOWN"
    reported_at: str | None = None
    sequence: int = 0
    fingerprint: str | None = None
    busy: bool = False
    generation: int = 0
    detections: list = field(default_factory=list)
    frame_meta: dict | None = None
    preview_processor: object = None


class CameraSessions:
    """Control state lasts one process; SQLite retains canonical decisions/audit.

    Each stop/error invalidates in-flight work. Reads never reevaluate risk.
    Capture timestamps, not detector completion timestamps, determine freshness.
    """

    def __init__(self, service, *, max_sessions=1000, preview_factory=None):
        self.service = service
        self.max_sessions = max_sessions
        self.preview_factory = preview_factory
        self._sessions = {}
        self._lock = threading.RLock()

    def start(self, scenario, source):
        if scenario not in SCENARIOS or source not in {"browser", "raspberry_pi"}:
            raise CameraError("INVALID_INPUT", "Choose a supported scenario and camera source")
        with self._lock:
            if len(self._sessions) >= self.max_sessions:
                raise CameraError("CAPACITY", "Camera session capacity reached; restart the demo service")
            session_id, token = self.service.create_demo_session()
            now = self.service.clock()
            slot = _Session(scenario=scenario, source=source, observed_at=now)
            self._unavailable(session_id, slot, "NO_FEED")
            self._sessions[session_id] = slot
            return {**self._read(session_id, slot), "session_token": token}

    def _authorize(self, session_id, token):
        if not isinstance(session_id, str) or not isinstance(token, str) or not token:
            raise CameraError("UNAUTHORIZED", "Camera session credentials required")
        try:
            self.service.authorize_demo_session(session_id, token)
        except PermissionError as exc:
            raise CameraError("UNAUTHORIZED", "Invalid camera session credentials") from exc
        slot = self._sessions.get(session_id)
        if slot is None:
            raise CameraError("SESSION_NOT_FOUND", "Camera session unavailable; start a new session")
        return slot

    def status(self, session_id, token):
        with self._lock:
            return self._read(session_id, self._authorize(session_id, token))

    def stop(self, session_id, token):
        with self._lock:
            slot = self._authorize(session_id, token)
            if slot.requested != "STOPPED":
                slot.requested = "STOPPED"
                slot.generation += 1
            current = self.service.get_state(f"DEMO_{session_id}")
            if current["camera_status"] != "NO_FEED":
                self._unavailable(session_id, slot, "NO_FEED")
            return self._read(session_id, slot)

    def report(self, session_id, token, device_status):
        if device_status not in {"ERROR", "DISCONNECTED", "STOPPED"}:
            raise CameraError("INVALID_INPUT", "Report ERROR, DISCONNECTED or STOPPED")
        with self._lock:
            slot = self._authorize(session_id, token)
            status = "NO_FEED" if device_status == "STOPPED" else device_status
            slot.generation += 1
            if device_status == "STOPPED":
                slot.requested = "STOPPED"
            slot.device_reported = device_status
            slot.reported_at = self.service.clock().isoformat()
            current = self.service.get_state(f"DEMO_{session_id}")
            if current["camera_status"] != status:
                self._unavailable(session_id, slot, status)
            return self._read(session_id, slot)

    def _unavailable(self, session_id, slot, status):
        # [] is only negative evidence with status OK; the existing rules handle
        # NO_FEED/ERROR/DISCONNECTED as unavailable evidence, never empty cabin.
        now = self.service.clock()
        vision = VisionPayload(
            vehicle_id=f"DEMO_{session_id}", timestamp=now,
            frame_id=f"control-{uuid4().hex}", camera_status=status, detected_objects=[],
        )
        state = self.service.ingest_demo(SCENARIOS[slot.scenario], vision)
        if state is None or state["camera_status"] != status:
            raise CameraError("STATE_NOT_COMMITTED", "Camera control evidence did not commit; check clock and retry")
        slot.observed_at = max(slot.observed_at, now)
        slot.detections = []
        slot.frame_meta = None
        slot.preview_processor = None

    def _preview(self, slot, image_bytes, sequence, captured_at):
        """Independent presentation pass; failure never downgrades backend risk."""
        try:
            if slot.preview_processor is None:
                if self.preview_factory is None:
                    raise ValueError('Face preview not configured')
                slot.preview_processor = self.preview_factory()
            preview = slot.preview_processor(image_bytes)
        except Exception:
            slot.preview_processor = None
            preview = {'status': 'UNAVAILABLE', 'reason': 'Face masking unavailable; image withheld'}
        return {**preview, 'sequence': sequence, 'captured_at': captured_at}

    def _validate_capture(self, captured_at):
        try:
            captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
        except (AttributeError, TypeError, ValueError) as exc:
            raise CameraError("INVALID_INPUT", "captured_at must be ISO8601 with timezone") from exc
        if captured.tzinfo is None:
            raise CameraError("INVALID_INPUT", "captured_at must include timezone")
        age = (self.service.clock() - captured).total_seconds()
        if age < 0:
            raise CameraError("CLOCK_SKEW", "Capture time is in the future; synchronize client clock")
        if age > 3:
            raise CameraError("STALE_FRAME", "Frame exceeded the existing 3 second Vision TTL")
        return captured

    def frame(self, session_id, token, image, sequence, captured_at, infer):
        with self._lock:
            slot = self._authorize(session_id, token)
            if slot.requested == "STOPPED":
                raise CameraError("STOPPED", "Camera session stopped; start a new session")
            if isinstance(sequence, bool) or not isinstance(sequence, int) or sequence < 1:
                raise CameraError("INVALID_INPUT", "sequence must be a positive integer")
            if not isinstance(image, Image.Image):
                raise CameraError("INVALID_IMAGE", "A decoded camera image is required")
            settings = get_settings()
            if image.width * image.height > settings.max_image_pixels:
                raise CameraError("IMAGE_TOO_LARGE", "Image exceeds pixel limit")
            output = BytesIO()
            image.convert("RGB").save(output, format="JPEG")
            image_bytes = output.getvalue()
            if len(image_bytes) > settings.max_upload_size_bytes:
                raise CameraError("IMAGE_TOO_LARGE", "Encoded frame exceeds upload limit")
            fingerprint = hashlib.sha256(image_bytes + str(captured_at).encode()).hexdigest()
            if sequence == slot.sequence:
                if fingerprint != slot.fingerprint:
                    raise CameraError("FRAME_CONFLICT", "Same sequence with different frame data")
                return {**self._read(session_id, slot), "frame_result": "DUPLICATE"}
            if sequence < slot.sequence:
                raise CameraError("OUT_OF_ORDER", "Frame sequence must increase")
            captured = self._validate_capture(captured_at)
            if captured <= slot.observed_at:
                raise CameraError("OUT_OF_ORDER", "Capture time must follow the previous observation")
            if slot.busy:
                raise CameraError("BUSY", "An inference is already running for this session")
            slot.busy = True
            generation = slot.generation
        try:
            try:
                frame = dict(infer(image_bytes))
                frame.update(timestamp=captured.isoformat(), frame_id=sequence)
                vision = to_vision_payload(
                    frame, vehicle_id=f"DEMO_{session_id}", source_id=session_id, camera_status="OK",
                )
                detections = []
                for item, raw, age in zip(
                    vision.detected_objects, frame["detections"], to_age_evidence(frame), strict=True,
                ):
                    detection = {"class": item.class_name, "confidence": item.confidence}
                    if age["age_group"] is not None:
                        detection["age_group"] = age["age_group"]
                        detection["age_scores"] = age["age_scores"]
                    bbox = raw.get("bbox")
                    if bbox is not None:
                        if not isinstance(bbox, list) or len(bbox) != 4 or any(
                            isinstance(value, bool) or not isinstance(value, (float, int)) or not math.isfinite(value)
                            for value in bbox
                        ):
                            raise ValueError("Invalid YOLO bounding box")
                        detection["bbox"] = list(bbox)
                    detections.append(detection)
            except Exception as exc:
                with self._lock:
                    if slot.requested != "STOPPED" and slot.generation == generation:
                        self._unavailable(session_id, slot, "ERROR")
                        slot.device_reported = "ERROR"
                        slot.reported_at = self.service.clock().isoformat()
                raise CameraError("INFERENCE_UNAVAILABLE", "Vision inference or model contract failed") from exc
            preview = self._preview(slot, image_bytes, sequence, captured.isoformat())
            with self._lock:
                if slot.requested == "STOPPED":
                    raise CameraError("STOPPED", "Camera stopped during inference; result discarded")
                if slot.generation != generation:
                    raise CameraError("CAMERA_CHANGED", "Camera status changed; result discarded")
                self._validate_capture(captured_at)
                self.service.ingest_demo(SCENARIOS[slot.scenario], vision)
                slot.sequence = sequence
                slot.fingerprint = fingerprint
                slot.observed_at = captured
                slot.device_reported = "CAPTURING"
                slot.reported_at = self.service.clock().isoformat()
                slot.detections = detections
                slot.frame_meta = {
                    "sequence": sequence, "captured_at": captured.isoformat(),
                    "width": image.width, "height": image.height, "latency_ms": vision.vision_latency_ms,
                }
                result = {**self._read(session_id, slot), "frame_result": "ACCEPTED", "preview": preview}
                # Keep the admission flag until finally; clearing it here could
                # let another frame start before this call finishes cleanup.
                result["camera"]["inference_busy"] = False
                return result
        finally:
            with self._lock:
                slot.busy = False

    def _read(self, session_id, slot):
        state = self.service.get_state_with_freshness(f"DEMO_{session_id}")
        if state is None:
            raise CameraError("STATE_UNAVAILABLE", "Camera session has no committed state")
        return {
            "session_id": session_id,
            "camera": {
                "source": slot.source, "requested": slot.requested,
                "device_reported": slot.device_reported, "reported_at": slot.reported_at,
                "last_sequence": slot.sequence, "inference_busy": slot.busy,
            },
            **{key: state.get(key) for key in (
                "revision", "risk_level", "rule_id", "reason", "occupancy_state",
                "camera_status", "freshness", "incident_id", "incident", "data_quality",
            )},
            "decision_current": bool(
                state["decision_current"] and slot.requested == "RUNNING" and slot.device_reported == "CAPTURING"
            ),
            "vision_detections": [
                {**obj, **({"bbox": list(obj["bbox"])} if "bbox" in obj else {})}
                for obj in slot.detections
            ],
            "frame": dict(slot.frame_meta) if slot.frame_meta else None,
            "actions": state.get("action_results", []),
            # Additive: durable action receipts and the human-only unlock request, so
            # clients can show action state after the evaluation that produced it.
            "action_ledger": state.get("action_ledger", []),
            "unlock_request": state.get("unlock_request"),
            "simulation": {
                "vehicle_source": "SIMULATED", "action_mode": "SIMULATED",
                "vision_source": "MODEL_INFERENCE" if state["camera_status"] == "OK" else "UNAVAILABLE",
            },
        }

    def tick_all(self):
        """Called by the existing SafetyTimer, never by a read API."""
        with self._lock:
            for session_id in self._sessions:
                slot = self._sessions[session_id]
                state = self.service.get_state(f"DEMO_{session_id}")
                desired = "NO_FEED" if slot.requested == "STOPPED" else (
                    slot.device_reported if slot.device_reported in {"ERROR", "DISCONNECTED"} else None
                )
                if desired and state and state["camera_status"] != desired:
                    self._unavailable(session_id, slot, desired)
                self.service.tick(f"DEMO_{session_id}")
