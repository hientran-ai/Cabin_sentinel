"""Convert Tâm's YOLO JSONL frame to the existing backend Vision contract."""

from collections.abc import Mapping

from src.cabinsentinel.models import VisionPayload

YOLO_OCCUPANT_LABELS = {"person", "dog", "cat"}


def to_vision_payload(
    frame: Mapping, *, vehicle_id: str, source_id: str, camera_status: str,
) -> VisionPayload:
    """Adapt one successful detector frame; the caller identifies the vision run.

    ``source_id`` must differ between runs because Tâm's frame counter restarts at 1.
    Inference failures have no frame and must be reported separately as camera errors.
    """
    if not isinstance(frame, Mapping) or "detections" not in frame:
        raise ValueError("detector frame must contain detections")
    detections = frame["detections"]
    if not isinstance(detections, list):
        raise ValueError("detections must be a list")
    if camera_status != "OK":
        raise ValueError("detector frame requires camera_status OK")
    if not isinstance(source_id, str) or not source_id or ":" in source_id:
        raise ValueError("source_id must be a non-empty run identifier without ':'")
    frame_number = frame.get("frame_id")
    if isinstance(frame_number, bool) or not isinstance(frame_number, int) or frame_number < 1:
        raise ValueError("detector frame_id must be a positive integer")

    objects = []
    for detection in detections:
        if not isinstance(detection, Mapping):
            raise ValueError("each detection must be an object")
        label = detection.get("class")
        if not isinstance(label, str):
            raise ValueError(f"unsupported detector class: {label!r}")
        if label in {"child", "adult"}:
            raise ValueError("age label mapping needs an approved safety contract")
        if label not in YOLO_OCCUPANT_LABELS:
            raise ValueError(f"unsupported detector class: {label!r}")
        objects.append({"class_name": label, "confidence": detection.get("confidence")})

    return VisionPayload.model_validate({
        "vehicle_id": vehicle_id,
        "timestamp": frame.get("timestamp"),
        "frame_id": f"{source_id}:{frame_number}",
        "camera_status": camera_status,
        "detected_objects": objects,
        "vision_latency_ms": frame.get("latency_ms"),
    })
