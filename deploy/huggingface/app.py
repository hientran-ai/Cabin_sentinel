"""Hugging Face ZeroGPU entrypoint: Gradio UI plus the full CabinSentinel FastAPI.

ZeroGPU only runs the Gradio SDK, and its startup check needs `demo.launch()`
and at least one `@spaces.GPU` function. So Gradio owns the server, and every
request under /api/, /health, /docs or /openapi.json is forwarded unchanged to
the CabinSentinel FastAPI app (its own middleware, auth and lifespan included).

GPU use: only the Gradio "Phân tích" button runs YOLO on the GPU. The REST API
runs YOLO on CPU (~40-100 ms per image), so frontend calls never spend the
visitor's ZeroGPU quota (2 min/day unauthenticated).
"""

import spaces  # noqa: I001 - must be imported before torch/CUDA for ZeroGPU

import asyncio
import hashlib
import os
import threading
import urllib.request
from io import BytesIO
from pathlib import Path
from uuid import uuid4

APP_DIR = Path(__file__).resolve().parent
WEIGHTS = APP_DIR / "models" / "yolov8n.pt"
WEIGHTS_URL = "https://github.com/ultralytics/assets/releases/download/v8.3.0/yolov8n.pt"
WEIGHTS_SHA256 = "f59b3d833e2ff32e194b5bb8e08d211dc7c5bdf144b90d2c8412c47ccfc83b36"

# This app is publicly reachable. Keep development-only demo login and remote
# commands disabled, and let the owner configure an exact frontend origin.
os.environ.setdefault("APP_ENV", "production")
os.environ.setdefault("CABINSENTINEL_MQTT_ENABLED", "false")
os.environ.setdefault("CABINSENTINEL_DB_PATH", str(APP_DIR / "data" / "cabinsentinel.db"))
os.environ.setdefault("MAX_CONCURRENT_DEMO_REQUESTS", "2")
os.environ.setdefault("MODEL_PATH", str(WEIGHTS))
os.environ.setdefault("YOLO_AUTOINSTALL", "false")
os.environ.setdefault("YOLO_OFFLINE", "true")
os.environ.setdefault("YOLO_CONFIG_DIR", "/tmp/ultralytics")


def ensure_weights() -> None:
    """Fetch the stock YOLOv8n weights once and refuse a file with another checksum."""
    if WEIGHTS.is_file() and hashlib.sha256(WEIGHTS.read_bytes()).hexdigest() == WEIGHTS_SHA256:
        return
    WEIGHTS.parent.mkdir(parents=True, exist_ok=True)
    data = urllib.request.urlopen(WEIGHTS_URL, timeout=120).read()
    if hashlib.sha256(data).hexdigest() != WEIGHTS_SHA256:
        raise RuntimeError("yolov8n.pt checksum mismatch")
    WEIGHTS.write_bytes(data)


ensure_weights()

# Import the backend before ultralytics: ultralytics patches PIL.Image.open on
# import, and demo_api must keep Pillow's own decoder for upload validation
# (otherwise a corrupt upload returns 500 instead of 422).
from src.cabinsentinel.api import get_cabin_service  # noqa: E402, I001
from src.cabinsentinel.camera_gradio import configure_inference, register_camera_api  # noqa: E402
from src.cabinsentinel.demo_api import SCENARIOS  # noqa: E402
from src.cabinsentinel.vision_adapter import to_vision_payload  # noqa: E402
from src.main import app as api  # noqa: E402

# isort: split
import gradio as gr  # noqa: E402
from routing import install_api_routes  # noqa: E402
from ultralytics import YOLO  # noqa: E402

SCENARIO_CHOICES = list(SCENARIOS)

# ZeroGPU: place the GPU copy of the model on CUDA at module level (emulated
# outside @spaces.GPU, real inside it). The REST API keeps its own CPU model.
gpu_model = YOLO(str(WEIGHTS))
try:
    gpu_model.to("cuda")
    GPU_DEVICE = 0
except Exception:  # CUDA not present (local run): the button falls back to CPU.
    GPU_DEVICE = "cpu"


def _detect_frame(image_bytes: bytes) -> dict:
    """Same detector settings as TamVisionProvider, run on the ZeroGPU device."""
    from datetime import UTC, datetime
    from time import perf_counter

    import cv2
    import numpy as np

    decoded = cv2.imdecode(np.frombuffer(image_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
    if decoded is None:
        raise ValueError("Cannot decode image for Vision inference")
    started = perf_counter()
    result = gpu_model.predict(
        decoded,
        classes=[0, 15, 16],
        device=GPU_DEVICE,
        conf=float(os.environ.get("MODEL_CONFIDENCE", "0.25")),
        imgsz=640,
        verbose=False,
    )[0]
    latency_ms = (perf_counter() - started) * 1000
    return {
        "timestamp": datetime.now(UTC).isoformat(),
        "frame_id": 1,
        "latency_ms": latency_ms,
        "detections": [
            {"class": result.names[int(b.cls.item())], "confidence": float(b.conf.item()), "bbox": b.xyxy[0].tolist()}
            for b in result.boxes
        ],
    }


@spaces.GPU(duration=20)
def detect_on_gpu(image_bytes: bytes) -> dict:
    """Single-image UI call, using the same detector as live camera frames."""
    return _detect_frame(image_bytes)


def analyze_ui(image, scenario):
    """Gradio button: GPU detection, then the same CabinService rules as the REST API."""
    if image is None:
        return {"error": "Vui lòng tải lên một ảnh cabin."}
    if scenario not in SCENARIOS:
        return {"error": f"Kịch bản không hợp lệ: {scenario}"}
    buffer = BytesIO()
    image.convert("RGB").save(buffer, format="JPEG")
    image_bytes = buffer.getvalue()
    try:
        frame, device = detect_on_gpu(image_bytes), "zerogpu" if GPU_DEVICE == 0 else "cpu"
    except Exception as exc:  # quota exhausted / no GPU: keep the demo working on CPU
        provider = api.state.vision_provider
        if provider is None:
            return {"error": f"Vision model unavailable ({type(exc).__name__})"}
        frame, device = provider.infer(image_bytes), f"cpu-fallback ({type(exc).__name__})"
    service = get_cabin_service()
    session_id, token = service.create_demo_session()
    vehicle_id = f"DEMO_{session_id}"
    vision = to_vision_payload(frame, vehicle_id=vehicle_id, source_id=uuid4().hex, camera_status="OK")
    state = service.ingest_demo(SCENARIOS[scenario], vision)
    return {
        "device": device,
        "latency_ms": round(frame["latency_ms"], 1),
        "session_id": session_id,
        "session_token": token,
        "detections": [{"class": d.class_name, "confidence": round(d.confidence, 3)} for d in vision.detected_objects],
        "risk_level": state["risk_level"],
        "rule_id": state["rule_id"],
        "reason": state["reason"],
        "occupancy_state": state["occupancy_state"],
        "actions": state.get("action_results", []),
    }


def run_api_lifespan() -> None:
    """Gradio's server never starts the FastAPI lifespan, so run it here:
    it loads the CPU vision model and starts the safety timer."""

    async def main():
        async with api.router.lifespan_context(api):
            provider = api.state.vision_provider
            if provider is not None:  # first CPU inference is slow; pay it before visitors do
                from PIL import Image

                blank = BytesIO()
                Image.new("RGB", (640, 480)).save(blank, format="JPEG")
                await asyncio.to_thread(provider.infer, blank.getvalue())
            await asyncio.Event().wait()

    asyncio.run(main())


with gr.Blocks(title="CabinSentinel V1") as demo:
    gr.Markdown(
        "# 🛡️ CabinSentinel V1 — In-Cabin Safety Backend\n"
        "REST API cho frontend: `POST /api/v1/demo/analyze` · `GET /health` · Swagger tại [`/docs`](/docs). "
        "Nút bên dưới chạy YOLO trên ZeroGPU; REST API chạy trên CPU. "
        "Mọi hành động (còi, SMS, thông báo) đều là mô phỏng."
    )
    with gr.Row():
        with gr.Column():
            input_image = gr.Image(type="pil", label="Ảnh cabin (JPEG / PNG)")
            input_scenario = gr.Dropdown(SCENARIO_CHOICES, value="hot_locked", label="Kịch bản xe")
            run = gr.Button("Phân tích", variant="primary")
        with gr.Column():
            output = gr.JSON(label="Kết quả")
    run.click(analyze_ui, inputs=[input_image, input_scenario], outputs=output, api_name="analyze")
    register_camera_api()
    api.state.camera_api = True


# demo.app only serves these routes after launch(); a router edited before launch is replaced
# (verified locally: /health and /api returned 404). The routes are inserted right after launch.


if __name__ == "__main__":
    threading.Thread(target=run_api_lifespan, daemon=True, name="cabinsentinel-lifespan").start()
    # Spaces set GRADIO_SSR_MODE=true: a Node server then owns the public port and
    # answers /health and /api/* with HTML instead of reaching this Python app.
    configure_inference(_detect_frame)
    demo.launch(
        server_name="0.0.0.0",
        server_port=int(os.environ.get("PORT", "7860")),
        prevent_thread_lock=True,
        ssr_mode=False,
    )
    install_api_routes(demo.app, api)
    demo.block_thread()
