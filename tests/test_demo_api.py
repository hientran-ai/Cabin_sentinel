"""V1 image demo flows through the canonical service and safety rules."""

from datetime import UTC, datetime
from io import BytesIO
from sqlite3 import OperationalError
from threading import current_thread, main_thread
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app


def image_bytes(format_name="JPEG"):
    output = BytesIO()
    Image.new("RGB", (32, 32), "white").save(output, format=format_name)
    return output.getvalue()


class FixtureVisionProvider:
    def __init__(self, now, detections):
        self.now = now
        self.detections = detections
        self.calls = 0

    def infer(self, image):
        self.calls += 1
        return {
            "timestamp": self.now.isoformat(), "frame_id": 1,
            "detections": self.detections, "latency_ms": 12.0,
        }


async def post_demo(tmp_path, *, scenario, detections, image=None, mime="image/jpeg"):
    now = datetime.now(UTC)
    service = CabinService(tmp_path / "demo.db", clock=lambda: now)
    provider = FixtureVisionProvider(now, detections)
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = provider
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": scenario},
                files={"image": ("cabin.jpg", image if image is not None else image_bytes(), mime)},
            )
        return response, service, provider
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_hot_occupant_upload_uses_service_rules_and_simulated_actions(tmp_path):
    now = datetime.now(UTC)
    service = CabinService(tmp_path / "demo.db", clock=lambda: now)

    class FixtureVisionProvider:
        def infer(self, image):
            assert image.startswith(b"\xff\xd8")
            return {
                "timestamp": now.isoformat(), "frame_id": 1,
                "detections": [{"class": "person", "confidence": 0.9, "bbox": [0, 0, 20, 20]}],
                "latency_ms": 12.0,
            }

    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = FixtureVisionProvider()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze",
                data={"scenario": "hot_locked"},
                files={"image": ("cabin.jpg", image_bytes(), "image/jpeg")},
            )
        assert response.status_code == 200
        body = response.json()
        assert body["vehicle_state"]["source"] == "SIMULATED"
        assert body["vision"]["source"] == "MODEL_INFERENCE"
        assert body["reasoning"]["risk_level"] == "CRITICAL"
        assert body["reasoning"]["rule_id"] == "HOT_OCCUPANT"
        assert body["reasoning"]["occupancy_state"] == "PRESENT"
        assert sorted(action["status"] for action in body["actions"]) == [
            "pending_human_confirmation", "simulated", "simulated",
        ]
        assert service.get_state(body["vehicle_state"]["vehicle_id"])["risk_level"] == "CRITICAL"
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("scenario", "detections", "expected_risk", "expected_rule"),
    [
        ("normal", [{"class": "person", "confidence": 0.9}], "SAFE", "ATTENDED_DRIVING"),
        ("parked_locked", [{"class": "person", "confidence": 0.9}], "WARNING", "COOL_OCCUPANT"),
        ("hot_locked", [], "SAFE", "EMPTY_CABIN"),
        ("hot_locked", [{"class": "dog", "confidence": 0.9}], "CRITICAL", "HOT_OCCUPANT"),
        ("hot_locked", [{"class": "cat", "confidence": 0.9}], "CRITICAL", "HOT_OCCUPANT"),
    ],
)
async def test_scenarios_use_existing_rules(tmp_path, scenario, detections, expected_risk, expected_rule):
    response, service, _ = await post_demo(
        tmp_path, scenario=scenario, detections=detections,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["reasoning"]["risk_level"] == expected_risk
    assert body["reasoning"]["rule_id"] == expected_rule
    assert body["vehicle_state"]["source"] == "SIMULATED"
    assert service.get_state(body["vehicle_state"]["vehicle_id"])["rule_id"] == expected_rule


@pytest.mark.asyncio
async def test_png_upload_is_accepted(tmp_path):
    response, _, provider = await post_demo(
        tmp_path, scenario="hot_locked", detections=[],
        image=image_bytes("PNG"), mime="image/png",
    )
    assert response.status_code == 200
    assert provider.calls == 1


@pytest.mark.asyncio
async def test_model_inference_does_not_block_the_event_loop(tmp_path):
    now = datetime.now(UTC)
    service = CabinService(tmp_path / "demo.db", clock=lambda: now)

    class ThreadCheckingProvider(FixtureVisionProvider):
        def infer(self, image):
            assert current_thread() is not main_thread()
            return super().infer(image)

    provider = ThreadCheckingProvider(now, [])
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = provider
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": "hot_locked"},
                files={"image": ("cabin.jpg", image_bytes(), "image/jpeg")},
            )
        assert response.status_code == 200
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("image", "mime", "expected_status"),
    [
        (b"", "image/jpeg", 422),
        (b"not-an-image", "image/jpeg", 422),
        (image_bytes("PNG"), "image/jpeg", 422),
        (image_bytes("PNG"), "image/gif", 415),
    ],
)
async def test_invalid_images_never_reach_provider(tmp_path, image, mime, expected_status):
    response, _, provider = await post_demo(
        tmp_path, scenario="hot_locked", detections=[], image=image, mime=mime,
    )
    assert response.status_code == expected_status
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_oversized_image_is_rejected_before_inference(tmp_path):
    response, _, provider = await post_demo(
        tmp_path, scenario="hot_locked", detections=[],
        image=b"x" * (5 * 1024 * 1024 + 1),
    )
    assert response.status_code == 413
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_excessive_decoded_dimensions_are_rejected(tmp_path, monkeypatch):
    monkeypatch.setattr(
        "src.cabinsentinel.demo_api.get_settings",
        lambda: SimpleNamespace(max_upload_size_bytes=5 * 1024 * 1024, max_image_pixels=1000),
    )
    response, _, provider = await post_demo(
        tmp_path, scenario="hot_locked", detections=[],
        image=image_bytes("PNG"), mime="image/png",
    )
    assert response.status_code == 413
    assert provider.calls == 0


@pytest.mark.asyncio
async def test_streamed_upload_stops_receiving_after_request_limit(tmp_path):
    service = CabinService(tmp_path / "demo.db")
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = object()
    chunks_sent = []
    total_chunks = 7

    async def body():
        yield (
            b"--x\r\nContent-Disposition: form-data; name=\"scenario\"\r\n\r\nhot_locked\r\n"
            b"--x\r\nContent-Disposition: form-data; name=\"image\"; filename=\"a.jpg\"\r\n"
            b"Content-Type: image/jpeg\r\n\r\n"
        )
        for _ in range(total_chunks):
            chunks_sent.append(1)
            yield b"x" * 1_000_000
        yield b"\r\n--x--\r\n"

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", content=body(),
                headers={"content-type": "multipart/form-data; boundary=x"},
            )
        assert response.status_code == 413, response.text
        assert len(chunks_sent) < total_chunks
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_missing_vision_provider_is_reported_as_unavailable(tmp_path):
    service = CabinService(tmp_path / "demo.db")
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": "hot_locked"},
                files={"image": ("cabin.jpg", image_bytes(), "image/jpeg")},
            )
        assert response.status_code == 503
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_invalid_image_returns_client_error_even_if_model_is_unavailable(tmp_path):
    service = CabinService(tmp_path / "demo.db")
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = None
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": "hot_locked"},
                files={"image": ("bad.jpg", b"not-an-image", "image/jpeg")},
            )
        assert response.status_code == 422
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_inference_failure_does_not_commit_a_demo_state(tmp_path):
    service = CabinService(tmp_path / "demo.db")

    class FailingProvider:
        def infer(self, _image):
            raise RuntimeError("model failed")

    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = FailingProvider()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": "hot_locked"},
                files={"image": ("cabin.jpg", image_bytes(), "image/jpeg")},
            )
        assert response.status_code == 503
        assert service._db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == 0
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_database_failure_returns_service_unavailable(tmp_path, monkeypatch):
    now = datetime.now(UTC)
    service = CabinService(tmp_path / "demo.db", clock=lambda: now)
    provider = FixtureVisionProvider(now, [])

    def fail_ingest(_payload):
        raise OperationalError("db down")

    monkeypatch.setattr(service, "ingest_sensor", fail_ingest)
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.state.vision_provider = provider
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                "/api/v1/demo/analyze", data={"scenario": "hot_locked"},
                files={"image": ("cabin.jpg", image_bytes(), "image/jpeg")},
            )
        assert response.status_code == 503
        assert "db down" not in response.text
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_unapproved_age_label_fails_without_committing_state(tmp_path):
    response, service, _ = await post_demo(
        tmp_path, scenario="hot_locked",
        detections=[{"class": "child", "confidence": 0.5, "detector_confidence": 0.9}],
    )
    assert response.status_code == 503
    assert service._db.execute("SELECT COUNT(*) FROM vehicles").fetchone()[0] == 0


@pytest.mark.asyncio
async def test_health_distinguishes_model_readiness(tmp_path):
    service = CabinService(tmp_path / "demo.db")
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        app.state.vision_provider = None
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            unavailable = await client.get("/health")
            app.state.vision_provider = object()
            ready = await client.get("/health")
        assert unavailable.status_code == 503
        assert unavailable.json()["vision"] == "unavailable"
        assert ready.status_code == 200
        assert ready.json()["vision"] == "ready"
        assert ready.json()["database"] == "ready"
    finally:
        app.dependency_overrides.clear()
        del app.state.vision_provider


@pytest.mark.asyncio
async def test_cors_only_allows_configured_frontend_origin():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        allowed = await client.options(
            "/api/v1/demo/analyze",
            headers={"origin": "http://localhost:3000", "access-control-request-method": "POST"},
        )
        denied = await client.options(
            "/api/v1/demo/analyze",
            headers={"origin": "https://unlisted.example", "access-control-request-method": "POST"},
        )
    assert allowed.headers["access-control-allow-origin"] == "http://localhost:3000"
    assert allowed.headers.get("access-control-allow-credentials") is None
    assert denied.headers.get("access-control-allow-origin") is None


@pytest.mark.asyncio
async def test_demo_response_contract_is_visible_in_openapi():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/openapi.json")
    operation = response.json()["paths"]["/api/v1/demo/analyze"]["post"]
    schema = operation["responses"]["200"]["content"]["application/json"]["schema"]
    assert schema["$ref"].endswith("/DemoResponse")
