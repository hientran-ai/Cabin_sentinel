"""Operations console API: fleet, devices, users & access, rules, models, audit, incidents, monitoring.

Every mutation is audited. Tenant-scoped staff (grant.tenant_id set) only see their tenant.
"""

import csv
import io
import json
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from pydantic import BaseModel, Field

from src.cabinsentinel.fleet import Fleet, Grant
from src.cabinsentinel.fleet_api import current_grant, get_fleet
from src.cabinsentinel.monitoring import metrics
from src.cabinsentinel.platform_api import EmailStr, audit, get_platform, guard, need
from src.cabinsentinel.platform_store import DEFAULT_ROLES, PERMISSIONS, PlatformStore
from src.config import get_settings

router = APIRouter(prefix="/api/v1", tags=["CabinSentinel Operations"])
STAFF = {"admin", "operator"}


def staff(grant: Grant = Depends(current_grant)) -> Grant:
    if grant.role not in STAFF:
        raise HTTPException(status_code=403, detail="Operations access required")
    return grant


def platform_admin(grant: Grant = Depends(staff)) -> Grant:
    if grant.tenant_id is not None:
        raise HTTPException(status_code=403, detail="Platform administrator required")
    return grant


def _tenant_users(store: PlatformStore, grant: Grant) -> list[dict]:
    return store.users(tenant_id=grant.tenant_id)


def _target_user(store: PlatformStore, grant: Grant, user_id: str) -> dict:
    user = guard(lambda: store.user(user_id))
    if grant.tenant_id is not None and user["tenant_id"] != grant.tenant_id:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# -- tenants -----------------------------------------------------------------------
class TenantInput(BaseModel):
    name: str = Field(min_length=2, max_length=120)


@router.get("/admin/tenants")
def list_tenants(grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    tenants = store.tenants()
    return {"tenants": [t for t in tenants if grant.tenant_id in {None, t["tenant_id"]}]}


@router.post("/admin/tenants", status_code=201)
def create_tenant(payload: TenantInput, request: Request, grant: Grant = Depends(platform_admin),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    tenant = store.create_tenant(payload.name)
    audit(request, store, grant, "tenant.create", tenant["tenant_id"])
    return tenant


# -- users & access ---------------------------------------------------------------------
class UserInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=10, max_length=256)
    full_name: str = Field(min_length=1, max_length=120)
    role: Literal["admin", "operator", "owner", "caregiver"]
    tenant_id: str | None = None


class UserPatch(BaseModel):
    role: Literal["admin", "operator", "owner", "caregiver"] | None = None
    active: bool | None = None


class RolePermissions(BaseModel):
    permissions: list[str] = Field(max_length=len(PERMISSIONS) + 1)


@router.get("/admin/users")
def list_users(grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    return {"users": _tenant_users(store, grant)}


@router.post("/admin/users", status_code=201)
def create_user(payload: UserInput, request: Request, grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    tenant_id = payload.tenant_id or grant.tenant_id
    if grant.tenant_id is not None and (tenant_id != grant.tenant_id or payload.role == "admin"):
        raise HTTPException(status_code=403, detail="Tenant staff cannot create platform admins or users in other tenants")
    user = guard(lambda: store.create_user(payload.email, payload.password, role=payload.role, full_name=payload.full_name,
                                           tenant_id=tenant_id))
    audit(request, store, grant, "user.create", user["user_id"], role=payload.role)
    return user


@router.patch("/admin/users/{user_id}")
def patch_user(user_id: str, payload: UserPatch, request: Request, grant: Grant = Depends(staff),
               store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    target = _target_user(store, grant, user_id)
    if user_id == grant.subject and (payload.active is False or (payload.role and payload.role != target["role"])):
        raise HTTPException(status_code=409, detail="You cannot change your own role or disable yourself")
    if grant.tenant_id is not None and payload.role == "admin":
        raise HTTPException(status_code=403, detail="Tenant staff cannot grant the admin role")
    demoting_admin = target["role"] == "admin" and target["active"] and (
        payload.active is False or (payload.role and payload.role != "admin"))
    if demoting_admin and store.active_admins() <= 1:
        raise HTTPException(status_code=409, detail="At least one active admin must remain")
    user = guard(lambda: store.set_user_access(user_id, role=payload.role, active=payload.active))
    audit(request, store, grant, "user.access_change", user_id, before={"role": target["role"], "active": target["active"]},
          after={"role": user["role"], "active": user["active"]})
    return user


@router.post("/admin/users/{user_id}/revoke-sessions")
def revoke_sessions(user_id: str, request: Request, grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    _target_user(store, grant, user_id)
    count = store.revoke_user_sessions(user_id)
    audit(request, store, grant, "user.revoke_sessions", user_id, sessions=count)
    return {"user_id": user_id, "revoked_sessions": count}


@router.get("/admin/roles")
def list_roles(grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    return {"roles": store.roles(), "permission_catalogue": sorted(PERMISSIONS), "defaults": DEFAULT_ROLES}


@router.put("/admin/roles/{role}")
def set_role(role: str, payload: RolePermissions, request: Request, grant: Grant = Depends(platform_admin),
             store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    before = store.roles().get(role)
    permissions = guard(lambda: store.set_role_permissions(role, payload.permissions))
    audit(request, store, grant, "role.permissions_change", role, before=before, after=permissions)
    return {"role": role, "permissions": permissions}


@router.get("/admin/access-review")
def access_review(inactive_days: int = Query(default=90, ge=1, le=3650), grant: Grant = Depends(staff),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "user.manage")
    from datetime import datetime, timedelta
    cutoff = store.clock() - timedelta(days=inactive_days)
    roles = store.roles()
    rows = []
    for user in _tenant_users(store, grant):
        seen = datetime.fromisoformat(user["last_login_at"]) if user["last_login_at"] else None
        flags = []
        if user["active"] and (seen is None or seen < cutoff):
            flags.append("INACTIVE_ACCOUNT")
        if user["role"] == "admin":
            flags.append("PRIVILEGED")
        rows.append({**user, "permissions": roles.get(user["role"], []), "flags": flags,
                     "caregiver_links": len(store.caregiver_links(user["user_id"])) if user["role"] == "owner" else 0})
    return {"as_of": store.clock().isoformat(), "inactive_days": inactive_days, "users": rows,
            "summary": {"total": len(rows), "flagged": sum(1 for r in rows if "INACTIVE_ACCOUNT" in r["flags"]),
                        "admins": sum(1 for r in rows if r["role"] == "admin" and r["active"])}}


# -- fleet management ----------------------------------------------------------------------
@router.get("/admin/vehicles")
def admin_vehicles(q: str | None = Query(default=None, max_length=80), tenant_id: str | None = None,
                   status: Literal["active", "retired"] | None = None, owner_id: str | None = None,
                   page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=1, le=100),
                   grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "fleet.read")
    result = store.search_vehicles(q=q, tenant_id=tenant_id, status=status, owner_id=owner_id, page=page,
                                   page_size=page_size, scope_tenant=grant.tenant_id)
    for item in result["items"]:
        if item["status"] == "active":
            summary = fleet.summary(item["vehicle_id"])
            item.update(online=summary["online"], risk_level=summary["risk_level"], active_incident=summary["active_incident"])
    return result


# -- devices -----------------------------------------------------------------------------
class FirmwareInput(BaseModel):
    target_firmware: str | None = Field(default=None, max_length=40)


def _device_scope(grant: Grant, store: PlatformStore, fleet: Fleet, device_id: str) -> dict:
    device = guard(lambda: store.device(device_id))
    if device["vehicle_id"] not in fleet.vehicles and grant.tenant_id is not None:
        raise HTTPException(status_code=404, detail="Device not found")
    if grant.tenant_id is not None and not fleet.can_view(grant, device["vehicle_id"]):
        raise HTTPException(status_code=404, detail="Device not found")
    return device


@router.get("/admin/devices")
def list_devices(status: Literal["active", "revoked"] | None = None, grant: Grant = Depends(staff),
                 store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "device.read")
    devices = [d for d in store.devices() if (grant.tenant_id is None or fleet.can_view(grant, d["vehicle_id"]))
               and (not status or d["status"] == status)]
    last = {d["device_id"]: (store.heartbeats(d["device_id"], 1) or [None])[0] for d in devices}
    return {"devices": [{**d, "last_heartbeat": last[d["device_id"]]} for d in devices],
            "summary": {"total": len(devices), "online": sum(1 for d in devices if d["online"]),
                        "update_pending": sum(1 for d in devices if d["update_pending"])}}


@router.get("/admin/devices/{device_id}/heartbeats")
def device_heartbeats(device_id: str, limit: int = Query(default=100, ge=1, le=1000), grant: Grant = Depends(staff),
                      store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "device.read")
    device = _device_scope(grant, store, fleet, device_id)
    return {"device": device, "heartbeats": store.heartbeats(device_id, limit)}


@router.post("/admin/devices/{device_id}/revoke")
def revoke_device(device_id: str, request: Request, grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform),
                  fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "device.manage")
    _device_scope(grant, store, fleet, device_id)
    device = guard(lambda: store.revoke_device(device_id))
    audit(request, store, grant, "device.revoke", device_id, vehicle=device["vehicle_id"])
    return device


@router.put("/admin/devices/{device_id}/firmware")
def set_firmware(device_id: str, payload: FirmwareInput, request: Request, grant: Grant = Depends(staff),
                 store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "device.manage")
    _device_scope(grant, store, fleet, device_id)
    device = guard(lambda: store.set_target_firmware(device_id, payload.target_firmware))
    audit(request, store, grant, "device.firmware_target", device_id, firmware=payload.target_firmware)
    return device


# -- incident operations -------------------------------------------------------------------
class IncidentOpsInput(BaseModel):
    vehicle_id: str
    version: int = Field(ge=0)
    assignee: str | None = Field(default=None, max_length=64)
    note: str | None = Field(default=None, max_length=300)


def _fleet_incidents(fleet: Fleet, store: PlatformStore, grant: Grant) -> list[dict]:
    items = []
    for vid in fleet.visible(grant):
        state = fleet.service.get_state_with_freshness(vid)
        incident = state.get("incident") if state else None
        if incident:
            items.append({**incident, "vehicle_id": vid, "vehicle_name": fleet.vehicles[vid]["name"],
                          "revision": state["revision"], "risk_level": state["risk_level"],
                          "ops": store.incident_ops(incident["incident_id"], vid)})
    return items


@router.get("/ops/incidents")
def ops_incidents(status: Literal["OPEN", "RESOLVED"] | None = None, assignee: str | None = None,
                  ops_status: str | None = None, page: int = Query(default=1, ge=1), page_size: int = Query(default=25, ge=1, le=100),
                  grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "fleet.read")
    items = [i for i in _fleet_incidents(fleet, store, grant)
             if (not status or i["status"] == status) and (not assignee or i["ops"]["assignee"] == assignee)
             and (not ops_status or i["ops"]["ops_status"] == ops_status)]
    items.sort(key=lambda i: (i["status"] != "OPEN", i.get("opened_at") or ""), reverse=False)
    start = (page - 1) * page_size
    return {"total": len(items), "page": page, "page_size": page_size, "items": items[start:start + page_size]}


def _ops_update(request, grant, store, fleet, incident_id, payload: IncidentOpsInput, action, **changes) -> dict:
    need(store, grant, "incident.manage")
    guard(lambda: fleet.require_view(grant, payload.vehicle_id))
    state = fleet.service.get_state_with_freshness(payload.vehicle_id)
    incident = state.get("incident") if state else None
    if not incident or incident["incident_id"] != incident_id:
        raise HTTPException(status_code=404, detail="Incident is not current for this vehicle")
    if incident["status"] != "OPEN" and action != "note":
        raise HTTPException(status_code=409, detail="Incident is already resolved")
    ops = guard(lambda: store.update_incident_ops(incident_id, payload.vehicle_id, payload.version, actor=grant.subject,
                                                  note=payload.note, **changes))
    audit(request, store, grant, f"incident.{action}", incident_id, vehicle=payload.vehicle_id, version=ops["version"])
    return ops


@router.post("/ops/incidents/{incident_id}/assign")
def assign_incident(incident_id: str, payload: IncidentOpsInput, request: Request, grant: Grant = Depends(staff),
                    store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    if not payload.assignee:
        raise HTTPException(status_code=422, detail="assignee is required")
    return _ops_update(request, grant, store, fleet, incident_id, payload, "assign", assignee=payload.assignee)


@router.post("/ops/incidents/{incident_id}/escalate")
def escalate_incident(incident_id: str, payload: IncidentOpsInput, request: Request, grant: Grant = Depends(staff),
                      store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    return _ops_update(request, grant, store, fleet, incident_id, payload, "escalate", ops_status="ESCALATED")


@router.post("/ops/incidents/{incident_id}/note")
def note_incident(incident_id: str, payload: IncidentOpsInput, request: Request, grant: Grant = Depends(staff),
                  store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    if not payload.note:
        raise HTTPException(status_code=422, detail="note is required")
    return _ops_update(request, grant, store, fleet, incident_id, payload, "note")


# -- remote commands (operator view) --------------------------------------------------------------
@router.get("/ops/commands")
def ops_commands(status: str | None = Query(default=None, max_length=20), limit: int = Query(default=100, ge=1, le=500),
                 grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "fleet.read")
    visible = fleet.visible(grant)
    return {"enabled": get_settings().commands_enabled, "commands": store.commands(visible, limit, status)}


class RejectInput(BaseModel):
    reason: str | None = Field(default=None, max_length=200)


@router.post("/ops/commands/{command_id}/reject")
def reject_command(command_id: str, payload: RejectInput, request: Request, grant: Grant = Depends(staff),
                   store: PlatformStore = Depends(get_platform), fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "command.request")
    command = guard(lambda: store.get_command(command_id))
    guard(lambda: fleet.require_view(grant, command["vehicle_id"]))
    result = guard(lambda: store.reject_command(command_id, grant.subject, payload.reason))
    audit(request, store, grant, "command.reject", command_id, vehicle=command["vehicle_id"])
    return result


# -- safety rules ---------------------------------------------------------------------------------
class RulesetInput(BaseModel):
    version: str = Field(pattern=r"^[A-Za-z0-9._-]{3,64}$")
    params: dict[str, float]
    note: str | None = Field(default=None, max_length=300)


@router.get("/admin/rulesets")
def list_rulesets(grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "system.read")
    return {"rulesets": store.rulesets(),
            "note": "applied_to_engine=false means the version is staged/audited only; rules.py still decides risk."}


@router.post("/admin/rulesets", status_code=201)
def create_ruleset(payload: RulesetInput, request: Request, grant: Grant = Depends(platform_admin),
                   store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "rules.manage")
    ruleset = guard(lambda: store.create_ruleset(payload.version, payload.params, payload.note, grant.subject))
    audit(request, store, grant, "ruleset.create", payload.version, params=payload.params)
    return ruleset


@router.post("/admin/rulesets/{version}/activate")
def activate_ruleset(version: str, request: Request, grant: Grant = Depends(platform_admin),
                     store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "rules.manage")
    ruleset = guard(lambda: store.activate_ruleset(version))
    audit(request, store, grant, "ruleset.activate", version)
    return ruleset


# -- model registry ---------------------------------------------------------------------------------
class ModelInput(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    version: str = Field(min_length=1, max_length=40)
    sha256: str | None = Field(default=None, pattern=r"^[0-9a-fA-F]{64}$")
    note: str | None = Field(default=None, max_length=300)


class RolloutInput(BaseModel):
    rollout_pct: int = Field(ge=0, le=100)


@router.get("/admin/models")
def list_models(grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "system.read")
    return {"models": store.models()}


@router.post("/admin/models", status_code=201)
def register_model(payload: ModelInput, request: Request, grant: Grant = Depends(platform_admin),
                   store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "model.manage")
    model = guard(lambda: store.register_model(payload.name, payload.version, payload.sha256, payload.note))
    audit(request, store, grant, "model.register", model["model_id"], name=payload.name, version=payload.version)
    return model


@router.post("/admin/models/{model_id}/rollout")
def rollout_model(model_id: str, payload: RolloutInput, request: Request, grant: Grant = Depends(platform_admin),
                  store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "model.manage")
    model = guard(lambda: store.rollout_model(model_id, payload.rollout_pct))
    audit(request, store, grant, "model.rollout", model_id, pct=payload.rollout_pct)
    return model


@router.post("/admin/models/{model_id}/rollback")
def rollback_model(model_id: str, request: Request, grant: Grant = Depends(platform_admin),
                   store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "model.manage")
    model = guard(lambda: store.rollback_model(model_id))
    audit(request, store, grant, "model.rollback", model_id, restored=model["model_id"])
    return model


# -- audit -----------------------------------------------------------------------------------------------
def _audit_filters(grant: Grant, actor, action, correlation_id, target, since, until, tenant_id) -> dict:
    return {"actor": actor, "action": action, "correlation_id": correlation_id, "target": target, "since": since,
            "until": until, "tenant_id": grant.tenant_id or tenant_id}


@router.get("/admin/audit")
def audit_log(actor: str | None = None, action: str | None = None, correlation_id: str | None = None, target: str | None = None,
              since: str | None = None, until: str | None = None, tenant_id: str | None = None,
              limit: int = Query(default=100, ge=1, le=500), offset: int = Query(default=0, ge=0),
              grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "audit.read")
    filters = _audit_filters(grant, actor, action, correlation_id, target, since, until, tenant_id)
    return {"entries": store.audit_query(**filters, limit=limit, offset=offset), "limit": limit, "offset": offset}


@router.get("/admin/audit/export")
def audit_export(request: Request, format: Literal["csv", "jsonl"] = "csv", actor: str | None = None, action: str | None = None,
                 correlation_id: str | None = None, target: str | None = None, since: str | None = None,
                 until: str | None = None, tenant_id: str | None = None, grant: Grant = Depends(staff),
                 store: PlatformStore = Depends(get_platform)) -> Response:
    need(store, grant, "audit.read")
    filters = _audit_filters(grant, actor, action, correlation_id, target, since, until, tenant_id)
    rows = store.audit_query(**filters, limit=10000)
    audit(request, store, grant, "audit.export", None, format=format, rows=len(rows))
    if format == "jsonl":
        return Response("\n".join(json.dumps(r) for r in rows), media_type="application/x-ndjson",
                        headers={"Content-Disposition": "attachment; filename=audit.jsonl"})
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["id", "ts", "actor", "actor_role", "tenant_id", "action", "target", "correlation_id", "outcome", "detail"])
    for r in rows:
        # Leading =,+,-,@ would be evaluated by spreadsheet apps.
        safe = [("'" + str(v)) if isinstance(v, str) and v[:1] in "=+-@" else v
                for v in (r["id"], r["ts"], r["actor"], r["actor_role"], r["tenant_id"], r["action"], r["target"],
                          r["correlation_id"], r["outcome"], json.dumps(r["detail"]))]
        writer.writerow(safe)
    return Response(buffer.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=audit.csv"})


class PurgeInput(BaseModel):
    older_than_days: int = Field(ge=30, le=3650)


@router.post("/admin/audit/purge")
def audit_purge(payload: PurgeInput, request: Request, grant: Grant = Depends(platform_admin),
                store: PlatformStore = Depends(get_platform)) -> dict:
    need(store, grant, "audit.manage")
    removed = store.audit_purge(payload.older_than_days)
    audit(request, store, grant, "audit.purge", None, older_than_days=payload.older_than_days, removed=removed)  # logged after the purge
    return {"removed": removed, "older_than_days": payload.older_than_days}


# -- system monitoring -----------------------------------------------------------------------------------
def _dependencies(request: Request, fleet: Fleet) -> dict[str, str]:
    subscriber = getattr(request.app.state, "sensor_subscriber", None)
    timer = getattr(request.app.state, "safety_timer", None)
    return {
        "database": "ready" if fleet.service.database_ready() else "unavailable",
        "vision": "ready" if getattr(request.app.state, "vision_provider", None) is not None else "unavailable",
        "mqtt": "disabled" if subscriber is None else "connected" if subscriber.connected else "disconnected",
        "safety_timer": "ready" if timer and timer.running and timer.last_error is None else "degraded",
    }


@router.get("/admin/system")
def system_status(request: Request, grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform),
                  fleet: Fleet = Depends(get_fleet)) -> dict:
    need(store, grant, "system.read")
    deps = _dependencies(request, fleet)
    return {"dependencies": deps, "metrics": metrics.snapshot(), "alerts": metrics.alerts(deps),
            "env": get_settings().app_env, "commands_enabled": get_settings().commands_enabled}


@router.get("/admin/system/vision")
def deployment_health(request: Request, grant: Grant = Depends(staff), store: PlatformStore = Depends(get_platform)) -> dict:
    """Which model the process actually loaded, next to what the registry says is active."""
    need(store, grant, "system.read")
    from src.cabinsentinel import capabilities
    return {"loaded": {"vision_model": capabilities.vision_model(), "privacy_model": capabilities.privacy_model(),
                       "age_classifier": capabilities.age_classifier(),
                       "provider_ready": getattr(request.app.state, "vision_provider", None) is not None},
            "registry_active": [m for m in store.models() if m["status"] in {"active", "staged"}]}
