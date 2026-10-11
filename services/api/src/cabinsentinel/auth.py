"""One demo ownership check shared by every HTTP boundary."""

from fastapi import HTTPException, Request
from fastapi.security import HTTPBearer

from src.cabinsentinel.service import CabinService

session_bearer = HTTPBearer(auto_error=False)


def authorize_session(request: Request, service: CabinService, session_id: str) -> str:
    scheme, _, token = request.headers.get("Authorization", "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise HTTPException(status_code=401, detail="Demo session token required")
    try:
        return service.authorize_demo_session(session_id, token)
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail="Invalid demo session credentials") from exc


def authorize_demo_vehicle(request: Request, service: CabinService, vehicle_id: str) -> None:
    if vehicle_id.startswith("DEMO_"):
        authorized = authorize_session(request, service, vehicle_id.removeprefix("DEMO_"))
        if authorized != vehicle_id:
            raise HTTPException(status_code=403, detail="Invalid demo session credentials")
