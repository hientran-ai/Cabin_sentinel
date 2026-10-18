"""Adapter: the standalone `p068_vision` pipeline (YOLO26s + face-age + YuNet, handoff of 17/10/2026) behind the provider contract the
e2e/demo API already uses (`infer(bytes) -> dict`). It changes NO rule, threshold or risk logic:

* `person`, `dog`, `cat` stay the only living evidence. Age is a separate field (`age_group`: child | adult | unknown); the class is never
  rewritten to "child", and unknown age stays unknown.
* People the pipeline places OUTSIDE the cabin (`exterior_detections`, only when a geometry for that camera is configured) are NOT occupants.
* Personal items go to `item_detections` only (never occupancy, never risk).
* The tracker/age smoothing is per `stream_id` (one per playback run). Without a stream id every frame is independent.
"""
import base64
import logging
import threading
from pathlib import Path
from time import perf_counter
from typing import Any

logger = logging.getLogger(__name__)
LIVING = {"person", "dog", "cat"}
SECOND_PASS_SCORE = 0.2          # the pipeline masks faces at 0.3; anything YuNet finds from 0.2 is covered too (more masking is the safe error)
SECOND_PASS_MAX_AREA = 0.04      # ignore "faces" larger than 4% of the frame: those are false detections, not faces


class P068VisionProvider:
    supports_items = True
    supports_stream = True

    def __init__(self, assets_root: str | Path, device: str = "cpu", geometry: str | Path | None = None, confidence: float = 0.25) -> None:
        from p068_vision import Pipeline

        self.assets_root = Path(assets_root)
        self.device = device
        self.confidence = confidence
        self.model_path = str(self.assets_root / "models" / "selection-20261015" / "yolo26s.pt")
        self.framework = "p068_vision (ultralytics YOLO26s + face-age + YuNet)"
        self._lock = threading.Lock()
        self._pipeline = Pipeline(assets_root=self.assets_root, device=device, **({"geometry": Path(geometry)} if geometry else {}))
        self.age_status = "ok"
        self.age_describe: dict[str, Any] = {}
        self._last_stream: str | None = None
        self._face2 = None
        try:   # second, more sensitive face pass used only to cover what the pipeline's own pass missed
            import cv2

            self._face2 = cv2.FaceDetectorYN.create(str(self.assets_root / "models" / "face_detection_yunet_2023mar.onnx"), "", (320, 320), SECOND_PASS_SCORE, 0.3, 5000)
        except Exception:
            logger.exception("Second face pass unavailable; only the pipeline's own face masking applies")

    def close(self) -> None:
        self._pipeline.close()

    def infer(self, image: bytes, stream_id: str | None = None, camera_id: str | None = None) -> dict:
        started = perf_counter()
        kwargs: dict[str, Any] = {"include_preview": True}
        if stream_id:
            kwargs["stream_id"] = stream_id
        if camera_id:
            kwargs["camera_id"] = camera_id
        with self._lock:
            if stream_id != self._last_stream:
                # The face masker holds the last few boxes for ONE live camera. Another session's boxes must never appear on this one's picture.
                blurrer = getattr(getattr(self._pipeline, "_preview", None), "blurrer", None)
                if blurrer is not None and hasattr(blurrer, "history"):
                    blurrer.history.clear()
                self._last_stream = stream_id
            result = self._pipeline.infer(image, **kwargs)
        detections, items = [], []
        for d in result.get("detections", []):
            label = d.get("class")
            base = {"class": label, "confidence": float(d["confidence"]), "bbox": [float(v) for v in d["bbox"]]}
            if label in LIVING:
                if label == "person":
                    group = d.get("age_group")
                    base["age_group"] = group if group in {"child", "adult"} else "unknown"   # anything else is "no evidence", never adult
                    base["age_scores"] = d.get("age_scores")
                if d.get("track_id") is not None:
                    base["track_id"] = d["track_id"]
                detections.append(base)
            elif label not in {"pet_unknown", "object", "adult", "child"}:
                items.append(base)
        age = result.get("age_classifier") or {}
        self.age_status = age.get("status", "disabled") if age.get("status") in {"ok", "disabled", "load_failed", "error"} else "disabled"
        self.age_describe = {k: age[k] for k in ("checkpoint_sha256", "model_classes", "thresholds") if k in age}
        return {
            "timestamp": result.get("timestamp"), "frame_id": 1, "detections": detections, "item_detections": items,
            "exterior_count": len(result.get("exterior_detections") or []),
            "latency_ms": result.get("latency_ms", (perf_counter() - started) * 1000),
            "detector_latency_ms": result.get("detector_latency_ms", 0.0), "age_latency_ms": result.get("age_latency_ms", 0.0),
            "age_classifier": {"status": self.age_status, **self.age_describe},
            "pipeline_version": result.get("pipeline_version"),
            "preview": self._cover_missed_faces(image, self._preview_of(result.get("preview"))),
        }

    def _cover_missed_faces(self, image: bytes, preview: dict[str, Any]) -> dict[str, Any]:
        """Opaque boxes over faces found by the sensitive second pass that no existing mask covers. Never removes a mask; on any error the
        pipeline's own masked picture is returned unchanged (its coverage is still not verified)."""
        if self._face2 is None or preview.get("status") != "PROCESSED":
            return preview
        try:
            import cv2
            import numpy as np

            with self._lock:   # the YuNet instance is stateful
                frame = cv2.imdecode(np.frombuffer(image, np.uint8), cv2.IMREAD_COLOR)
                h, w = frame.shape[:2]
                self._face2.setInputSize((w, h))
                _, faces = self._face2.detect(frame)
            return cover_uncovered_faces(preview, [] if faces is None else faces.tolist(), (w, h))
        except Exception:
            logger.exception("Second face pass failed; returning the pipeline's masked picture")
            return preview

    @staticmethod
    def _preview_of(preview: Any) -> dict[str, Any]:
        """Face-masked picture for display. Coverage is never claimed: YuNet can miss faces."""
        if not isinstance(preview, dict) or preview.get("status") != "PROCESSED" or not preview.get("data_url"):
            return {"status": "UNAVAILABLE", "data_url": None}
        return {"status": "PROCESSED", "data_url": preview["data_url"], "method": preview.get("method"),
                "detected_faces": preview.get("detected_faces"), "masked_regions": preview.get("masked_regions"), "boxes": preview.get("masked_boxes", []),
                "coverage_verified": False}


def cover_uncovered_faces(preview: dict[str, Any], faces: list[list[float]], size: tuple[int, int], boxes: list[list[float]] | None = None) -> dict[str, Any]:
    """Draw opaque rectangles over `faces` (x, y, w, h, ...) whose centre is not inside an already masked box. Pure function over the data URL."""
    import cv2
    import numpy as np

    width, height = size
    known = boxes if boxes is not None else preview.get("boxes", [])
    todo = []
    for face in faces:
        x, y, fw, fh = face[:4]
        if fw * fh > SECOND_PASS_MAX_AREA * width * height or fw <= 0 or fh <= 0:
            continue
        # covered = (almost) all of the face lies inside ONE existing mask. A face that only has its centre under a mask still shows an edge.
        if any(_inside_fraction((x, y, x + fw, y + fh), b) >= 0.85 for b in known):
            continue
        todo.append((x, y, fw, fh))
    if not todo:
        return preview
    raw = base64.b64decode(preview["data_url"].split(",", 1)[1])
    image = cv2.imdecode(np.frombuffer(raw, np.uint8), cv2.IMREAD_COLOR)
    for x, y, fw, fh in todo:
        pad = int(0.15 * max(fw, fh))
        cv2.rectangle(image, (max(0, int(x) - pad), max(0, int(y) - pad)), (min(width, int(x + fw) + pad), min(height, int(y + fh) + pad)), (30, 30, 30), -1)
    ok, buf = cv2.imencode(".jpg", image)
    if not ok:
        return preview
    return {**preview, "data_url": "data:image/jpeg;base64," + base64.b64encode(buf.tobytes()).decode(), "masked_regions": int(preview.get("masked_regions") or 0) + len(todo),
            "second_pass_regions": len(todo)}


def _inside_fraction(face: tuple[float, float, float, float], box: list[float]) -> float:
    w = min(face[2], box[2]) - max(face[0], box[0])
    h = min(face[3], box[3]) - max(face[1], box[1])
    area = (face[2] - face[0]) * (face[3] - face[1])
    return (w * h) / area if w > 0 and h > 0 and area > 0 else 0.0
