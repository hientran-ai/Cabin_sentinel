"""Forward the public CabinSentinel API paths to FastAPI under Gradio."""

from starlette.routing import BaseRoute, Match

API_PREFIXES = ("/api/", "/health", "/docs", "/redoc", "/openapi.json")


class ForwardToApi(BaseRoute):
    """Hand matching requests to FastAPI before Gradio's own routes."""

    def __init__(self, api):
        self.api = api

    def matches(self, scope):
        path = scope.get("path", "")
        if scope["type"] == "http" and any(path == p.rstrip("/") or path.startswith(p) for p in API_PREFIXES):
            return Match.FULL, {}
        return Match.NONE, {}

    async def handle(self, scope, receive, send):
        await self.api(scope, receive, send)


def install_api_routes(gradio_app, api):
    """Install FastAPI routing before the Gradio server begins accepting requests."""
    route = ForwardToApi(api)
    gradio_app.router.routes.insert(0, route)
    return route
