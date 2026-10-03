import importlib.util
from unittest.mock import AsyncMock

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from src.main import app

# Camera/privacy suites need optional packages (requirements-camera.txt); skip them cleanly otherwise.
OPTIONAL_SUITES = {
    "test_camera_gradio.py": ("gradio", "spaces", "cv2"),
    "test_camera_privacy.py": ("cv2", "numpy"),
    "test_vision_privacy.py": ("cv2", "numpy"),
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
