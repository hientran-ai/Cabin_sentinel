"""Bound multipart request bytes before Starlette spools uploaded files."""

from threading import Lock

from starlette.responses import JSONResponse

from src.config import get_settings


class _UploadLimitError(Exception):
    pass


class DemoUploadLimitMiddleware:
    def __init__(self, app, *, max_concurrent_requests: int | None = None):
        self.app = app
        self.max_concurrent_requests = (
            get_settings().max_concurrent_demo_requests
            if max_concurrent_requests is None else max_concurrent_requests
        )
        if self.max_concurrent_requests < 1:
            raise ValueError("max_concurrent_requests must be at least 1")
        self._admission_lock = Lock()
        self._active_demo_requests = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or scope["path"] != "/api/v1/demo/analyze":
            await self.app(scope, receive, send)
            return

        with self._admission_lock:
            overloaded = self._active_demo_requests >= self.max_concurrent_requests
            if not overloaded:
                self._active_demo_requests += 1
        if overloaded:
            response = JSONResponse(
                status_code=503,
                content={"detail": "Demo capacity is busy; retry shortly"},
                headers={"Retry-After": "1"},
            )
            await response(scope, receive, send)
            return

        try:
            # Permit small multipart headers and scenario text beyond the image cap.
            limit = get_settings().max_upload_size_bytes + 64 * 1024
            headers = dict(scope.get("headers", []))
            try:
                declared_length = int(headers.get(b"content-length", b"0"))
            except ValueError:
                declared_length = 0
            if declared_length > limit:
                await self._reject(scope, receive, send)
                return

            received = 0
            exceeded = False
            response_started = False

            async def limited_receive():
                nonlocal received, exceeded
                if exceeded:
                    raise _UploadLimitError
                message = await receive()
                if message["type"] == "http.request":
                    received += len(message.get("body", b""))
                    if received > limit:
                        exceeded = True
                        raise _UploadLimitError
                return message

            async def track_send(message):
                nonlocal response_started
                if exceeded:
                    return
                if message["type"] == "http.response.start":
                    response_started = True
                await send(message)

            try:
                await self.app(scope, limited_receive, track_send)
            except _UploadLimitError:
                if response_started:
                    raise
            if exceeded:
                await self._reject(scope, receive, send)
        finally:
            with self._admission_lock:
                self._active_demo_requests -= 1

    @staticmethod
    async def _reject(scope, receive, send):
        response = JSONResponse(status_code=413, content={"detail": "Upload exceeds request limit"})
        await response(scope, receive, send)
