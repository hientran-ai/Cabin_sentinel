"""Real YOLO weights through the E2E API. Skipped (never faked) when the weights are not on disk.

The three frames are stills of the project's own simulator clips (not a test of real cabins):
`ai-child` (an AI-generated child, detected as `person`), `child-rear` (a child in a rear-facing
seat, which the stock detector misses; known SR-01 gap) and `empty-cabin`.
"""

import os
from datetime import timedelta
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.actions import DemoActions
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.test_cabinsentinel import NOW
from tests.test_e2e_api import HOT_PARKED

ROOT = Path(__file__).resolve().parent.parent
WEIGHTS = Path(os.environ.get("MODEL_PATH") or ROOT / "models" / "yolov8n.pt")
FIXTURES = Path(__file__).parent / "fixtures" / "e2e"
pytestmark = pytest.mark.skipif(not WEIGHTS.is_file(), reason=f"model weights not found at {WEIGHTS}")


@pytest.fixture(scope="module")
def provider():
    from src.vision.provider import TamVisionProvider

    return TamVisionProvider(WEIGHTS)


async def run(provider, tmp_path, fixture, temperature):
    clock = [NOW]
    service = CabinService(tmp_path / "real.db", clock=lambda: clock[0], actions=DemoActions())
    app.dependency_overrides[get_cabin_service] = lambda: service
    previous = getattr(app.state, "vision_provider", None)
    app.state.vision_provider = provider
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
            created = (await c.post("/api/v1/e2e/sessions")).json()
            sid, h = created["session_id"], {"Authorization": "Bearer " + created["session_token"]}
            await c.post(f"/api/v1/e2e/sessions/{sid}/sensor", headers=h, json={**HOT_PARKED, "temperature": temperature})
            clock[0] += timedelta(milliseconds=200)
            r = await c.post(
                f"/api/v1/e2e/sessions/{sid}/observations", headers=h,
                data={"frame_id": fixture, "source": "CLIP_FRAME", "source_label": fixture},
                files={"image": (fixture + ".jpg", (FIXTURES / f"{fixture}.jpg").read_bytes(), "image/jpeg")},
            )
            assert r.status_code == 200, r.text
            state = (await c.get(f"/api/v1/e2e/sessions/{sid}/state", headers=h)).json()
            return r.json(), state
    finally:
        app.dependency_overrides.pop(get_cabin_service, None)
        app.state.vision_provider = previous


@pytest.mark.asyncio
async def test_actual_model_detects_person_and_drives_critical(provider, tmp_path):
    obs, state = await run(provider, tmp_path, "ai-child", 40.0)
    assert obs["vision"]["source"] == "MODEL_INFERENCE" and obs["timings_ms"]["infer_detector"] > 0
    assert obs["model"]["ready"] and len(obs["model"]["sha256"]) == 64
    assert any(d["class"] == "person" and d["confidence"] >= 0.4 for d in obs["vision"]["detections"])
    assert state["risk_level"] == "CRITICAL" and state["rule_id"] == "HOT_OCCUPANT"
    # `person` is not `child`: nothing in the committed state labels a child
    assert "child" not in str(state["detected_objects"]).lower()


@pytest.mark.asyncio
async def test_actual_model_miss_is_recorded_not_replaced(provider, tmp_path):
    obs, state = await run(provider, tmp_path, "child-rear", 40.0)
    # SR-01: the stock detector sees nobody in the rear-facing seat. The output is kept as is.
    assert obs["vision"]["detections"] == []
    # Approved decision 20261017-UNKNOWN-PROJECTION: no detection is not proof of absence.
    assert state["detected_objects"] == [] and state["occupancy_state"] == "UNKNOWN"
    assert state["risk_level"] == "ERROR" and state["rule_id"] == "OCCUPANCY_UNVERIFIED"


@pytest.mark.asyncio
async def test_actual_model_empty_cabin_frame(provider, tmp_path):
    obs, state = await run(provider, tmp_path, "empty-cabin", 25.0)
    assert obs["vision"]["detections"] == [] and state["occupancy_state"] == "UNKNOWN"
    assert state["risk_level"] == "ERROR" and state["rule_id"] == "OCCUPANCY_UNVERIFIED"
