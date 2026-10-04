"""Boundary between model-specific inference and CabinSentinel reasoning."""

import logging
from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class VisionProvider(Protocol):
    def infer(self, image: bytes) -> dict:
        """Return one native detector frame for a successfully decoded image."""


class TamVisionProvider:
    """One-frame CPU adapter for Tâm's YOLOv8n video detector settings.

    An optional age classifier labels each ``person`` box as adult/child/unknown in a
    separate ``age_group`` field. The detector ``class`` stays ``person`` so occupancy
    evidence is unchanged; a missing, failed or unsure classifier yields ``unknown``.
    """

    def __init__(
        self, model_path: str | Path, *, confidence: float = 0.25,
        age_classifier: Any = None, age_load_error: str | None = None,
    ):
        path = Path(model_path)
        if not path.is_file():
            raise FileNotFoundError(f"MODEL_PATH is not a local file: {path}")
        if not 0 < confidence <= 1:
            raise ValueError("MODEL_CONFIDENCE must be in (0, 1]")
        from ultralytics import YOLO

        self._model = YOLO(str(path))
        self._options = {
            "classes": [0, 15, 16], "device": "cpu", "conf": confidence,
            "imgsz": 640, "verbose": False,
        }
        self._age = age_classifier
        self._age_load_error = age_load_error
        self._lock = Lock()

    @property
    def age_status(self) -> str:
        if self._age is not None:
            return "ok"
        return "load_failed" if self._age_load_error else "disabled"

    @staticmethod
    def _crop_rect(bbox, frame):
        """The padded rectangle the classifier crops, recorded for tracing (None if unavailable)."""
        try:
            from src.vision.age import padded_box

            rect = padded_box(bbox, frame.shape[1], frame.shape[0])
            return list(rect) if rect else None
        except Exception:
            return None

    def infer(self, image: bytes) -> dict:
        import cv2
        import numpy as np

        decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
        if decoded is None:
            raise ValueError("Cannot decode image for Vision inference")
        with self._lock:
            started = perf_counter()
            result = self._model.predict(decoded, **self._options)[0]
            detector_ms = (perf_counter() - started) * 1000
            detections = [
                {
                    "class": result.names[int(box.cls.item())],
                    "confidence": float(box.conf.item()),
                    "bbox": box.xyxy[0].tolist(),
                }
                for box in result.boxes
            ]
            age_status, age_ms = self.age_status, 0.0
            people = [d for d in detections if d["class"] == "person"]
            for detection in people:
                detection.update(age_group="unknown", age_scores=None)
            if self._age is not None and people:
                age_started = perf_counter()
                try:
                    # The original decoded frame is classified; nothing blurred is ever used here.
                    answers = self._age.classify(decoded, [d["bbox"] for d in people])
                    if len(answers) != len(people):
                        raise ValueError("age classifier returned a different number of answers")
                    for detection, answer in zip(people, answers, strict=True):
                        detection.update(answer)
                        detection.setdefault("age_crop", self._crop_rect(detection["bbox"], decoded))
                except Exception:
                    logger.exception("Age classification failed; people stay age_group=unknown")
                    age_status = "error"
                    for detection in people:
                        detection.update(age_group="unknown", age_scores=None)
                age_ms = (perf_counter() - age_started) * 1000
            latency_ms = (perf_counter() - started) * 1000
        return {
            "timestamp": datetime.now(UTC).isoformat(), "frame_id": 1,
            "detections": detections, "latency_ms": latency_ms,
            "detector_latency_ms": detector_ms, "age_latency_ms": age_ms,
            "age_classifier": {
                "status": age_status,
                **(self._age.describe() if self._age is not None else {}),
                **({"error": self._age_load_error} if self._age_load_error else {}),
            },
        }
