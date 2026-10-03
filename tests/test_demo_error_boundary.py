import pytest
from httpx import ASGITransport, AsyncClient

from src.cabinsentinel.api import get_cabin_service
from src.cabinsentinel.service import CabinService
from src.main import app


@pytest.mark.asyncio
async def test_session_read_database_failure_is_explicit_503(tmp_path):
    service = CabinService(tmp_path / "state.db")
    sid, token = service.create_demo_session()
    service._db.close()
    app.dependency_overrides[get_cabin_service] = lambda: service
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app, raise_app_exceptions=False), base_url="http://test"
        ) as c:
            result = await c.get(f"/api/v1/demo/sessions/{sid}", headers={"Authorization": "Bearer " + token})
        assert result.status_code == 503
        assert result.json()["detail"] == "CabinService unavailable"
    finally:
        app.dependency_overrides.clear()
