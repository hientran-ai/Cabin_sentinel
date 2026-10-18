from datetime import timedelta
from io import BytesIO

import pytest
from httpx import ASGITransport, AsyncClient
from PIL import Image

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.demo_api import get_vision_provider
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.test_cabinsentinel import NOW


def png():
    f = BytesIO()
    Image.new("RGB", (32, 32)).save(f, format="PNG")
    return f.getvalue()


@pytest.mark.asyncio
async def test_model_upload_session_refresh_poll_ack_and_resolution(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    objects = [{"class": "dog", "confidence": 0.9, "bbox": [1, 1, 20, 20]}]

    class Provider:
        def infer(self, image):
            return {"timestamp": clock[0].isoformat(), "frame_id": 1, "detections": objects, "latency_ms": 1.0}

    provider = Provider()
    app.dependency_overrides[get_cabin_service] = lambda: service
    app.dependency_overrides[get_vision_provider] = lambda: provider
    app.state.vision_provider = provider
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            result = await c.post(
                "/api/v1/demo/analyze",
                data={"scenario": "parked_locked"},
                files={"image": ("c.png", png(), "image/png")},
            )
            assert result.status_code == 200
            first = result.json()
            assert "session_token" in first
            sid = first["session_id"]
            headers = {"Authorization": "Bearer " + first["session_token"]}
            url = f"/api/v1/demo/sessions/{sid}"
            assert (await c.get(url)).status_code == 401
            assert (await c.get(url, headers={"Authorization": "Bearer wrong"})).status_code == 403
            state = (await c.get(url, headers=headers)).json()
            assert state["incident"]["status"] == "OPEN"
            incident = state["incident_id"]
            ack = await c.post(url + "/acknowledge", headers=headers, json={"incident_id": incident})
            assert ack.status_code == 200
            assert ack.json()["incident"]["status"] == "OPEN"
            clock[0] += timedelta(seconds=1)
            refreshed = await c.post(
                "/api/v1/demo/analyze",
                headers=headers,
                data={"scenario": "hot_locked", "session_id": sid},
                files={"image": ("c.png", png(), "image/png")},
            )
            assert refreshed.status_code == 200
            assert refreshed.json()["session_id"] == sid
            state = (await c.get(url, headers=headers)).json()
            assert state["risk_level"] == "CRITICAL"
            assert state["incident_id"] == incident
            assert state["alert"]["lock_timing"]["source"] == "SIMULATED"
            assert (
                await c.post(
                    url + "/resolve",
                    headers=headers,
                    json={"incident_id": incident, "revision": state["revision"], "cabin_checked": True},
                )
            ).status_code == 409
            clock[0] += timedelta(seconds=1)
            objects.clear()
            await c.post(
                "/api/v1/demo/analyze",
                headers=headers,
                data={"scenario": "parked_locked", "session_id": sid},
                files={"image": ("c.png", png(), "image/png")},
            )
            state = (await c.get(url, headers=headers)).json()
            assert state["risk_level"] == "ERROR"
            assert state["occupancy_state"] == "UNKNOWN"
            resolve = {"incident_id": incident, "revision": state["revision"], "cabin_checked": True}
            resolved = await c.post(url + "/resolve", headers=headers, json=resolve)
            assert resolved.status_code == 200
            assert resolved.json()["incident"]["status"] == "RESOLVED"
            assert resolved.json()["risk_level"] == "ERROR"
            assert (await c.get(url + "/events", headers=headers)).status_code == 200
            before = service.get_state("DEMO_" + sid)["revision"]
            await c.get(url, headers=headers)
            assert service.get_state("DEMO_" + sid)["revision"] == before
    finally:
        app.dependency_overrides.clear()
        app.state.vision_provider = None


@pytest.mark.asyncio
async def test_session_creation_database_failure_returns_503(tmp_path):
    service = CabinService(tmp_path / "state.db")
    service._db.close()
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as c:
            result = await c.post(
                "/api/v1/demo/analyze",
                data={"scenario": "parked_locked"},
                files={"image": ("c.png", png(), "image/png")},
            )
        assert result.status_code == 503
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_swagger_exposes_bearer_auth_for_session_operations():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        spec = (await c.get("/openapi.json")).json()
    operation = spec["paths"]["/api/v1/demo/sessions/{session_id}/resolve"]["post"]
    assert operation.get("security")
    name = next(iter(operation["security"][0]))
    assert spec["components"]["securitySchemes"][name]["scheme"] == "bearer"
