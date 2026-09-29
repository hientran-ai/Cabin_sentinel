"""Boundary between model-specific inference and CabinSentinel reasoning."""

from datetime import UTC, datetime
from pathlib import Path
from threading import Lock
from time import perf_counter
from typing import Protocol


class VisionProvider(Protocol):
    def infer(self, image: bytes) -> dict:
        """Return one native detector frame for a successfully decoded image."""


class TamVisionProvider:
    """One-frame CPU adapter for Tâm's YOLOv8n video detector settings.

    The optional age classifier is deliberately excluded: its child/adult labels
    have no approved safety mapping at the CabinSentinel boundary.
    """

    def __init__(self, model_path: str | Path, *, confidence: float = 0.25):
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
        self._lock = Lock()

    def infer(self, image: bytes) -> dict:
        import cv2
        import numpy as np

        decoded = cv2.imdecode(np.frombuffer(image, dtype=np.uint8), cv2.IMREAD_COLOR)
        if decoded is None:
            raise ValueError("Cannot decode image for Vision inference")
        with self._lock:
            started = perf_counter()
            result = self._model.predict(decoded, **self._options)[0]
            latency_ms = (perf_counter() - started) * 1000
        detections = [
            {
                "class": result.names[int(box.cls.item())],
                "confidence": float(box.conf.item()),
                "bbox": box.xyxy[0].tolist(),
            }
            for box in result.boxes
        ]
        return {
            "timestamp": datetime.now(UTC).isoformat(), "frame_id": 1,
            "detections": detections, "latency_ms": latency_ms,
        }
