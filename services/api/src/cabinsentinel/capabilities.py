"""Model capability reporting for /health. Reports facts only; loads no model."""

import hashlib
import os
from collections.abc import Callable
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


_age_status_source: Callable[[], str | None] | None = None


def bind_age_status(source: Callable[[], str | None] | None) -> None:
    """Let every caller of ``age_classifier()`` see the live provider's state (None unbinds).

    /health passes the provider status explicitly; endpoints that call ``age_classifier()`` without it
    (/admin/system/vision) would otherwise report only the checkpoint file, contradicting /health.
    """
    global _age_status_source
    _age_status_source = source


def age_classifier(status: str | None = None) -> dict:
    """Age is evidence only (never an input to risk or actions); never fabricate a checkpoint.

    ``status`` is the vision provider's own view (ok / error / load_failed / disabled); when omitted it comes from
    the provider bound with ``bind_age_status``. Without any provider view the checkpoint path from
    AGE_CLASSIFIER_PATH (or the older AGE_MODEL_PATH) is only reported, not claimed usable.
    """
    if status is None and _age_status_source is not None:
        status = _age_status_source()
    if status == "ok":
        return {"available": True, "reason": None, "role": "EVIDENCE_ONLY"}
    if status == "load_failed":
        return {"available": False, "reason": "load_failed"}
    if status == "error":
        return {"available": False, "reason": "inference_error"}
    path = os.environ.get("AGE_CLASSIFIER_PATH") or os.environ.get("AGE_MODEL_PATH", "")
    if not path or not Path(path).is_file():
        return {"available": False, "reason": "checkpoint_unavailable"}
    return {
        "available": False, "reason": "disabled" if status == "disabled" else "not_loaded",
        "sha256": file_sha256(path),
    }


def storage(db_path: str) -> dict:
    """Is the database on a volume that survives a restart? A free HF Space or an unmounted container path is not."""
    from src.config import get_settings

    configured = get_settings().storage_persistent
    path = Path(db_path).resolve()
    mounted = any(p != Path("/") and os.path.ismount(p) for p in [path.parent, *path.parent.parents])
    persistent = configured if configured is not None else mounted
    return {"persistent": bool(persistent), "path_kind": "volume" if persistent else "ephemeral",
            "note": None if persistent else "Dữ liệu mất khi dịch vụ khởi động lại. Gắn volume (Docker) hoặc Persistent Storage (HF) và đặt CABINSENTINEL_DB_PATH vào đó."}


def snapshot(app) -> dict:
    """One view of the loaded models, shared by /health and /admin/system so they can never disagree."""
    provider = getattr(app.state, "vision_provider", None)
    age_status = getattr(provider, "age_status", "disabled")
    return {"vision_model": vision_model(), "privacy_model": privacy_model(), "age_classifier": age_classifier(age_status),
            "provider_ready": provider is not None, "age_status": age_status}
