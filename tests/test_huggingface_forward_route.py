from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.responses import PlainTextResponse
from starlette.routing import Route

from deploy.huggingface.routing import install_api_routes


def test_fastapi_routes_are_forwarded_before_existing_gradio_routes():
    api = FastAPI()

    @api.get("/health")
    def health():
        return {"source": "fastapi"}

    async def gradio_health(_request):
        return PlainTextResponse("gradio")

    gradio = Starlette(routes=[Route("/health", gradio_health)])

    install_api_routes(gradio, api)

    response = TestClient(gradio).get("/health")

    assert response.status_code == 200
    assert response.json() == {"source": "fastapi"}
