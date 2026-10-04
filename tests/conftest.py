import importlib.util
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel import fleet_api
from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.fleet import Fleet
from src.cabinsentinel.platform_store import PlatformStore
from src.cabinsentinel.service import CabinService
from src.main import app
from tests.fleet_helpers import NOW

# Camera/privacy suites need optional packages (requirements-camera.txt); skip them cleanly otherwise.
OPTIONAL_SUITES = {
    "test_camera_gradio.py": ("gradio", "spaces", "cv2"),
    "test_camera_privacy.py": ("cv2", "numpy"),
    "test_vision_privacy.py": ("cv2", "numpy"),
    # Vision suites (BaoTam) import numpy/torch/cv2 at module level; CI installs only requirements.txt.
    "test_vision_age.py": ("numpy", "torch", "torchvision"),
    "test_vision_age_adapter.py": ("numpy", "torch", "torchvision"),
    "test_vision_motion.py": ("cv2", "numpy"),
    "test_vision_overlay.py": ("cv2", "numpy"),
    "test_vision_video.py": ("cv2", "numpy", "imageio_ffmpeg"),
}
collect_ignore = [
    name for name, modules in OPTIONAL_SUITES.items()
    if any(importlib.util.find_spec(module) is None for module in modules)
]


@pytest_asyncio.fixture
async def client():
    """Async HTTP client for testing API endpoints."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest.fixture
def mock_llm():
    """Mock LLM to avoid calling OpenAI during tests.

    Usage in test:
        def test_something(mock_llm):
            # LLM calls will return mock response instead of hitting OpenAI
            ...
    """
    mock = AsyncMock()
    mock.ainvoke.return_value = AsyncMock(content="Mocked LLM response")
    return mock


@pytest.fixture
def env(tmp_path, monkeypatch):
    """Platform API harness: real routing, SQLite stores, controllable clock."""
    clock = [NOW]
    service = CabinService(tmp_path / "svc.db", clock=lambda: clock[0])
    store = PlatformStore(tmp_path / "platform.db", clock=lambda: clock[0], signing_key="test-key")
    fleet = Fleet(service, device_token="legacy-device", device_source="SIMULATED")
    store.attach(fleet)
    app.dependency_overrides[fleet_api.get_fleet] = lambda: fleet
    app.dependency_overrides[get_cabin_service] = lambda: service
    monkeypatch.setattr(fleet_api, "get_fleet", lambda: fleet)
    client = TestClient(app)
    yield SimpleNamespace(client=client, service=service, store=store, fleet=fleet, clock=clock)
    app.dependency_overrides.clear()
    service._db.close()
    store._db.close()
