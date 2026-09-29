import asyncio
from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from starlette.responses import Response

from src.cabinsentinel.upload_limit import DemoUploadLimitMiddleware


@pytest.mark.asyncio
async def test_busy_demo_request_is_rejected_before_reading_upload_body(monkeypatch):
    entered = asyncio.Event()
    release = asyncio.Event()
    handled = 0

    async def app(scope, receive, send):
        nonlocal handled
        handled += 1
        entered.set()
        if handled == 1:
            await release.wait()
        while True:
            message = await receive()
            if not message.get("more_body", False):
                break
        await Response(status_code=200)(scope, receive, send)

    monkeypatch.setattr(
        "src.cabinsentinel.upload_limit.get_settings",
        lambda: SimpleNamespace(
            max_concurrent_demo_requests=1,
            max_upload_size_bytes=5 * 1024 * 1024,
        ),
    )
    limited_app = DemoUploadLimitMiddleware(app)
    body_chunks = []

    async def second_request_body():
        body_chunks.append("read")
        yield b"second upload"

    try:
        async with AsyncClient(transport=ASGITransport(app=limited_app), base_url="http://test") as client:
            first = asyncio.create_task(client.post("/api/v1/demo/analyze", content=b"first upload"))
            await asyncio.wait_for(entered.wait(), timeout=1)

            rejected = await client.post(
                "/api/v1/demo/analyze", content=second_request_body(),
            )

            assert rejected.status_code == 503
            assert rejected.headers["retry-after"] == "1"
            assert body_chunks == []
            assert handled == 1

            release.set()
            assert (await first).status_code == 200

            retried = await client.post("/api/v1/demo/analyze", content=b"retry upload")
            assert retried.status_code == 200
            assert handled == 2
    finally:
        release.set()
