"""Model outages must not accumulate unreachable demo credentials in SQLite."""

import pytest
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.test_cabinsentinel import NOW
from tests.test_demo_api import image_bytes


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", ["missing", "inference_failure", "invalid_contract"])
async def test_failed_model_request_does_not_persist_a_session(tmp_path, mode):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)

    class Provider:
        def infer(self, _image):
            if mode == "inference_failure":
                raise RuntimeError("Fixture inference failed")
            return {
                "timestamp": NOW.isoformat(),
                "frame_id": 1,
                "detections": [{"class": "child", "confidence": 0.9}],
                "latency_ms": 1,
            }

    previous = getattr(app.state, "vision_provider", None)
    app.state.vision_provider = None if mode == "missing" else Provider()
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for _ in range(3):
                result = await client.post(
                    "/api/v1/demo/analyze",
                    data={"scenario": "parked_locked"},
                    files={"image": ("sample.png", image_bytes("PNG"), "image/png")},
                )
                assert result.status_code == 503
        for table in ["demo_sessions", "vehicles", "events", "action_ledger"]:
            assert service._db.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0
    finally:
        app.dependency_overrides.clear()
        app.state.vision_provider = previous
        service._db.close()
