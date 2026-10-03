"""Exercise our Gradio contract with the real queue and HTTP routes."""

import importlib
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from io import BytesIO
from threading import Event

import gradio as gr
from PIL import Image
from starlette.testclient import TestClient

from tests.test_live_camera_sessions import NOW, detector
from src.cabinsentinel.service import CabinService


def test_registered_camera_api_upload_sse_and_stop(tmp_path, monkeypatch):
    assert importlib.util.find_spec("src.cabinsentinel.camera_gradio") is not None, "Camera API registration missing"
    module = importlib.import_module("src.cabinsentinel.camera_gradio")
    from src.cabinsentinel.camera import CameraSessions

    clock = [NOW]
    service = CabinService(tmp_path / "camera.db", clock=lambda: clock[0])
    sessions = CameraSessions(service)
    monkeypatch.setattr(module, "get_camera_sessions", lambda: sessions)
    monkeypatch.setattr(module, "infer_frame", detector)
    with gr.Blocks() as demo:
        module.register_camera_api()
    demo.queue()
    # launch() sets this field; TestClient runs the same app without binding TCP.
    demo.max_file_size = None

    def call(client, name, data):
        created = client.post(f"/gradio_api/call/{name}", json={"data": data})
        assert created.status_code == 200
        result = client.get(f"/gradio_api/call/{name}/{created.json()['event_id']}")
        assert result.status_code == 200
        import json
        for event in result.text.split("\n\n"):
            if "event: complete" in event:
                return json.loads(next(line[6:] for line in event.splitlines() if line.startswith("data: ")))[0]
        raise AssertionError(result.text)

    try:
        with TestClient(demo.app, headers={"Origin": "https://frontend.example"}) as client:
            assert client.get("/gradio_api/startup-events").status_code == 200
            schema = client.get("/gradio_api/info")
            assert schema.headers["Access-Control-Allow-Origin"] == "https://frontend.example"
            info = schema.json()["named_endpoints"]
            assert {"/camera_start", "/camera_status", "/camera_frame", "/camera_stop", "/camera_report"} <= set(info)
            creds = call(client, "camera_start", ["hot_locked", "browser"])
            sid, token = creds["session_id"], creds["session_token"]
            clock[0] += timedelta(seconds=1)
            image = BytesIO()
            Image.new("RGB", (32, 32)).save(image, format="PNG")
            uploaded = client.post("/gradio_api/upload", files={"files": ("frame.png", image.getvalue(), "image/png")})
            assert uploaded.status_code == 200
            result = call(client, "camera_frame", [sid, token, {"path": uploaded.json()[0], "meta": {"_type": "gradio.FileData"}}, 1, clock[0].isoformat()])
            assert result["risk_level"] == "CRITICAL"
            assert result["decision_current"] is True
            wrong = call(client, "camera_status", [sid, "wrong"])
            assert wrong["code"] == "UNAUTHORIZED"
            entered, release = Event(), Event()
            def pending_inference(image):
                entered.set()
                assert release.wait(5)
                return detector(image)
            monkeypatch.setattr(module, "infer_frame", pending_inference)
            clock[0] += timedelta(seconds=1)
            submitted = client.post("/gradio_api/call/camera_frame", json={"data": [sid, token, {"path": uploaded.json()[0], "meta": {"_type": "gradio.FileData"}}, 2, clock[0].isoformat()]})
            with ThreadPoolExecutor() as executor:
                late = executor.submit(client.get, f"/gradio_api/call/camera_frame/{submitted.json()['event_id']}")
                assert entered.wait(5)
                clock[0] += timedelta(seconds=1)
                try:
                    stopped = call(client, "camera_stop", [sid, token])
                    assert stopped["camera"]["requested"] == "STOPPED"
                    assert stopped["decision_current"] is False
                finally:
                    release.set()
                assert '"STOPPED"' in late.result(timeout=5).text
    finally:
        demo.close()
        service._db.close()


def test_camera_yolo_reuses_model_and_selects_allocated_gpu(monkeypatch, tmp_path):
    import sys
    from types import SimpleNamespace
    from src.cabinsentinel import camera_gradio as module

    path = tmp_path / "existing-model.pt"
    path.write_bytes(b"fixture")
    calls = {"loads": 0}

    class Scalar:
        def __init__(self, value): self.value = value
        def item(self): return self.value

    class Model:
        def __init__(self, model_path):
            assert model_path == str(path)
            calls["loads"] += 1
        def predict(self, image, **options):
            assert options["device"] == "0"
            box = SimpleNamespace(cls=Scalar(0), conf=Scalar(0.9), xyxy=[SimpleNamespace(tolist=lambda: [1, 2, 20, 30])])
            return [SimpleNamespace(names={0: "person"}, boxes=[box])]

    monkeypatch.setenv("MODEL_PATH", str(path))
    monkeypatch.setattr(module, "_provider", None)
    monkeypatch.setitem(sys.modules, "torch", SimpleNamespace(cuda=SimpleNamespace(is_available=lambda: True)))
    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLO=Model))
    monkeypatch.setitem(sys.modules, "cv2", SimpleNamespace(IMREAD_COLOR=1, imdecode=lambda *args: "frame"))
    first = module.infer_frame(b"image-1")
    second = module.infer_frame(b"image-2")
    assert first["detections"] == second["detections"] == [{"class": "person", "confidence": 0.9, "bbox": [1, 2, 20, 30]}]
    assert calls["loads"] == 1
