"""Additive Gradio API; device clients own camera capture and shutdown."""

import logging
import os
import sqlite3
from threading import Lock

import gradio as gr
import spaces

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.camera import CameraError, CameraSessions
from src.vision.preview import FacePreview

logger = logging.getLogger(__name__)
_runtime_lock = Lock()
_sessions = None
_configured_inference = None
_provider = None


def get_camera_sessions():
    global _sessions
    with _runtime_lock:
        if _sessions is None:
            _sessions = CameraSessions(get_cabin_service(), preview_factory=FacePreview)
        return _sessions


def camera_uses_gpu():
    """Live frames run on CPU unless CAMERA_DEVICE=gpu: on ZeroGPU every GPU frame spends a quota run, and
    anonymous visitors hit "exceeded your ZeroGPU runs limit" after a few frames (frame and preview then null)."""
    return os.environ.get("CAMERA_DEVICE", "cpu").strip().lower() == "gpu"


def configure_inference(inference):
    """Use the entrypoint's existing GPU detector under its ZeroGPU allocation."""
    global _configured_inference
    _configured_inference = inference


def infer_frame(image_bytes):
    global _provider
    if not camera_uses_gpu():
        # On CPU, reuse the API's vision provider so live frames get the same age_group evidence as REST.
        from src.main import app

        shared = getattr(app.state, "vision_provider", None)
        if shared is not None:
            return shared.infer(image_bytes)
    with _runtime_lock:
        if _provider is None:
            device = "cpu"
            if camera_uses_gpu():
                # Called inside spaces.GPU: CUDA is available only after allocation.
                import torch
                device = "0" if torch.cuda.is_available() else "cpu"
            from ultralytics import YOLO
            model = YOLO(os.environ["MODEL_PATH"])
            _provider = (model, device)
        provider = _provider
    model, device = provider
    from datetime import UTC, datetime
    from time import perf_counter

    import cv2
    import numpy as np

    decoded = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise ValueError("Cannot decode image for Vision inference")
    started = perf_counter()
    result = model.predict(
        decoded, classes=[0, 15, 16], device=device,
        conf=0.25, imgsz=640, verbose=False,
    )[0]
    return {
        "timestamp": datetime.now(UTC).isoformat(), "frame_id": 1,
        "latency_ms": (perf_counter() - started) * 1000,
        "detections": [
            {"class": result.names[int(box.cls.item())], "confidence": float(box.conf.item()),
             "bbox": box.xyxy[0].tolist()}
            for box in result.boxes
        ],
    }


def _run(operation, *args):
    try:
        return getattr(get_camera_sessions(), operation)(*args)
    except CameraError as exc:
        return {"error": exc.message, "code": exc.code, "decision_current": False}
    except sqlite3.Error:
        logger.exception("Camera session storage unavailable")
        return {"error": "Camera session storage unavailable", "code": "STORAGE_UNAVAILABLE", "decision_current": False}


def camera_start(scenario, source):
    return _run("start", scenario, source)


def camera_status(session_id, session_token):
    return _run("status", session_id, session_token)


def camera_stop(session_id, session_token):
    return _run("stop", session_id, session_token)


def camera_report(session_id, session_token, device_status):
    return _run("report", session_id, session_token, device_status)


def _frame(session_id, session_token, image, sequence, captured_at):
    # The entrypoint's configured detector lives on the GPU; CPU mode always uses this module's own model.
    inference = (_configured_inference or infer_frame) if camera_uses_gpu() else infer_frame
    return _run("frame", session_id, session_token, image, sequence, captured_at, inference)


_frame_on_gpu = spaces.GPU(duration=60)(_frame)


def camera_frame(session_id, session_token, image, sequence, captured_at):
    run = _frame_on_gpu if camera_uses_gpu() else _frame
    return run(session_id, session_token, image, sequence, captured_at)


def register_camera_api():
    """Call inside Blocks. Control endpoints bypass the inference event queue."""
    with gr.Group(visible=False):
        scenario = gr.Textbox(value="hot_locked")
        source = gr.Textbox(value="browser")
        sid = gr.Textbox()
        token = gr.Textbox(type="password")
        image = gr.Image(type="pil", sources=["upload"])
        sequence = gr.Number(precision=0)
        captured_at = gr.Textbox()
        device_status = gr.Textbox()
        result = gr.JSON()
        for name, fn, inputs in (
            ("camera_start", camera_start, [scenario, source]),
            ("camera_status", camera_status, [sid, token]),
            ("camera_stop", camera_stop, [sid, token]),
            ("camera_report", camera_report, [sid, token, device_status]),
        ):
            gr.Button(visible=False).click(fn, inputs=inputs, outputs=result, api_name=name, queue=False)
        gr.Button(visible=False).click(
            camera_frame, inputs=[sid, token, image, sequence, captured_at], outputs=result,
            api_name="camera_frame", concurrency_limit=1,
        )
