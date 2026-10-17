"""Public integration boundary; owns model state without importing backend code."""

import hashlib
import json
from importlib.resources import files
from pathlib import Path
from threading import Lock


def verify_assets(assets_root):
    """Verify every selected local checkpoint before constructing any model."""
    root = Path(assets_root).resolve()
    manifest = json.loads(files("p068_vision").joinpath("assets.json").read_text(encoding="utf-8"))
    paths = {}
    for relative, expected in manifest.items():
        path = root / relative
        if not path.is_file():
            raise FileNotFoundError(f"Missing model asset: {path}")
        with path.open("rb") as handle:
            actual = hashlib.file_digest(handle, "sha256").hexdigest()
        if path.stat().st_size != expected["bytes"] or actual != expected["sha256"]:
            raise ValueError(f"Model checksum mismatch: {relative}")
        paths[expected["role"]] = path
    return paths


class Pipeline:
    """YOLO26s + face age + temporal tracking/motion + opaque face preview.

    Construct once per backend worker and close during shutdown. Reuse a unique
    stream_id per live camera; omit it for independent still images. The caller
    owns upload validation, authentication, persistence and alert decisions.
    """

    def __init__(
        self, assets_root, *, device="cpu", confidence=0.25, imgsz=512,
        child_threshold=0.7, adult_threshold=0.8, geometry=None,
        opencv_threads=4, torch_threads=4, parallel_inference=True,
        face_max_side=768,
    ):
        paths = verify_assets(assets_root)
        # Configure a local Ultralytics directory before its first import.
        import os
        import tempfile

        os.environ.setdefault("YOLO_AUTOINSTALL", "false")
        os.environ.setdefault("YOLO_OFFLINE", "true")
        config_root = Path(os.environ.setdefault(
            "YOLO_CONFIG_DIR", str(Path(tempfile.gettempdir()) / "p068-ultralytics"),
        ))
        config_root.mkdir(parents=True, exist_ok=True)

        from .age import AgeClassifier
        from .cabin_geometry import CabinGeometry
        from .preview import FacePreview
        from .provider import TamVisionProvider

        if isinstance(geometry, (str, Path)):
            geometry = json.loads(Path(geometry).read_text(encoding="utf-8"))
        geometry = CabinGeometry(geometry) if geometry is not None else None
        age = AgeClassifier(
            paths["age_classifier"], child_threshold, adult_threshold,
            face_model_path=paths["face_detector"], face_max_side=face_max_side,
        )
        if age.child_age_max != 9:
            raise ValueError("Selected age checkpoint must use child_age_max=9")
        self._preview = FacePreview(model_path=paths["face_detector"])
        self._provider = TamVisionProvider(
            paths["object_detector"], age_classifier=age, confidence=confidence,
            device=device, imgsz=imgsz, opencv_threads=opencv_threads,
            torch_threads=torch_threads, parallel_inference=parallel_inference,
            cabin_geometry=geometry,
        )
        # Includes the shared YuNet preview instance, whose detector is stateful.
        self._lock = Lock()
        self._closed = False

    def _finish(self, frame, decoded, include_preview):
        evidence = frame.pop("_face_evidence", None)
        # Cover people across the full image before separating exterior boxes.
        frame["preview"] = self._preview(
            decoded.source, include_image=include_preview,
            face_evidence=evidence, decoded_image=decoded,
        )
        exterior, interior = [], []
        for detection in frame["detections"]:
            target = exterior if detection.get("cabin_membership", {}).get("label") == "outside" else interior
            target.append(detection)
        frame["detections"] = interior
        frame["exterior_detections"] = exterior
        return frame

    def infer(self, image, *, stream_id=None, camera_id=None, include_preview=True):
        """Return JSON-compatible detections and preview from encoded JPEG/PNG bytes.

        include_preview=False omits the JPEG data URL; masking metadata remains.
        Raw pixels and private shared face evidence never enter the response.
        """
        with self._lock:
            if self._closed:
                raise RuntimeError("Pipeline is closed")
            frame, decoded = self._provider.infer_with_context(
                image, stream_id=stream_id, camera_id=camera_id,
            )
            return self._finish(frame, decoded, include_preview)

    def infer_frame(self, pixels, *, stream_id=None, camera_id=None, include_preview=True):
        """Live-camera entry point for a uint8 BGR array; owns a copy of pixels."""
        with self._lock:
            if self._closed:
                raise RuntimeError("Pipeline is closed")
            frame, decoded = self._provider.infer_frame_with_context(
                pixels, stream_id=stream_id, camera_id=camera_id,
            )
            return self._finish(frame, decoded, include_preview)

    def close(self):
        with self._lock:
            if not self._closed:
                self._provider.close()
                self._closed = True

    def __enter__(self):
        return self

    def __exit__(self, *_exc):
        self.close()
