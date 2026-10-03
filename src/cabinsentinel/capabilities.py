"""Model capability reporting for /health. Reports facts only; loads no model."""

import hashlib
import os
from functools import lru_cache
from pathlib import Path

from src.vision.preview import DEFAULT_MODEL, MODEL_SHA256


@lru_cache(maxsize=8)
def _sha256(path: str, size: int, mtime: float) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def file_sha256(path: str | Path) -> str | None:
    file = Path(path)
    if not file.is_file():
        return None
    stat = file.stat()
    return _sha256(str(file), stat.st_size, stat.st_mtime)


def vision_model() -> dict:
    path = os.environ.get("MODEL_PATH", "")
    checksum = file_sha256(path) if path else None
    return {"name": Path(path).name if path else None, "sha256": checksum, "available": checksum is not None}


def privacy_model() -> dict:
    path = Path(os.environ.get("FACE_MODEL_PATH", str(DEFAULT_MODEL)))
    checksum = file_sha256(path)
    try:
        import cv2
        opencv = hasattr(cv2, "FaceDetectorYN")
    except ImportError:
        opencv = False
    reason = (
        "model_missing" if checksum is None else
        "checksum_mismatch" if checksum != MODEL_SHA256 else
        "opencv_unavailable" if not opencv else None
    )
    return {
        "available": reason is None, "reason": reason, "method": "YUNET_SOFT_OVAL",
        "name": path.name, "sha256": checksum, "expected_sha256": MODEL_SHA256,
    }


def age_classifier() -> dict:
    """No approved age checkpoint or safety mapping exists; never fabricate one."""
    path = os.environ.get("AGE_MODEL_PATH", "")
    if not path or not Path(path).is_file():
        return {"available": False, "reason": "checkpoint_unavailable"}
    return {
        "available": False, "reason": "not_integrated_pending_safety_validation",
        "sha256": file_sha256(path),
    }
