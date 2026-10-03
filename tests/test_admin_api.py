"""Operations console: users/access, fleet search, devices, incidents, rules, models, audit, monitoring."""

import csv
import io
from datetime import timedelta

from tests.test_platform_api import (  # noqa: F401  (env is a pytest fixture)
    PASSWORD,
    add_vehicle,
    auth,
    critical_incident,
    feed,
    make_admin,
    make_operator,
    pair,
    sign_in,
    signup,
    user_token,
)


def test_operations_endpoints_reject_owners_caregivers_and_anonymous(env):
    owner = user_token(env, "o@example.com")
    caregiver = user_token(env, "c@example.com", "caregiver")
    for path in ("/api/v1/admin/users", "/api/v1/admin/vehicles", "/api/v1/admin/audit", "/api/v1/admin/system", "/api/v1/ops/incidents"):
        assert env.client.get(path).status_code == 401
        assert env.client.get(path, headers=auth(owner)).status_code == 403
        assert env.client.get(path, headers=auth(caregiver)).status_code == 403


def test_user_admin_role_changes_revoke_sessions_and_protect_last_admin(env):
    admin = make_admin(env)
    admin_id = env.client.get("/api/v1/me/profile", headers=auth(admin)).json()["user_id"]
    created = env.client.post("/api/v1/admin/users", json={"email": "ops2@example.com", "password": PASSWORD, "full_name": "Op", "role": "operator"}, headers=auth(admin)).json()
    victim = sign_in(env, "ops2@example.com")["access_token"]
    assert env.client.get("/api/v1/admin/audit", headers=auth(victim)).status_code == 200
    changed = env.client.patch(f"/api/v1/admin/users/{created['user_id']}", json={"role": "owner"}, headers=auth(admin)).json()
    assert changed["role"] == "owner"
    # The role change took effect immediately: old token is dead.
    assert env.client.get("/api/v1/admin/audit", headers=auth(victim)).status_code == 403
    assert env.client.patch(f"/api/v1/admin/users/{admin_id}", json={"role": "owner"}, headers=auth(admin)).status_code == 409
    second = make_admin(env, "admin2@example.com")
    second_id = env.client.get("/api/v1/me/profile", headers=auth(second)).json()["user_id"]
    assert env.client.patch(f"/api/v1/admin/users/{second_id}", json={"active": False}, headers=auth(admin)).status_code == 200
    assert env.client.get("/api/v1/auth/me", headers=auth(second)).status_code == 403
    assert env.client.post("/api/v1/auth/login", json={"email": "admin2@example.com", "password": PASSWORD}).status_code == 401
    assert env.store.active_admins() == 1


def test_role_permissions_are_editable_and_enforced(env):
    admin, operator = make_admin(env), make_operator(env)
    assert env.client.get("/api/v1/admin/audit", headers=auth(operator)).status_code == 200
    assert env.client.put("/api/v1/admin/roles/operator", json={"permissions": ["fleet.read", "bogus.perm"]}, headers=auth(admin)).status_code == 422
    assert env.client.put("/api/v1/admin/roles/admin", json={"permissions": ["fleet.read"]}, headers=auth(admin)).status_code == 422
    assert env.client.put("/api/v1/admin/roles/operator", json={"permissions": ["fleet.read"]}, headers=auth(admin)).status_code == 200
    assert env.client.get("/api/v1/admin/audit", headers=auth(operator)).status_code == 403
    assert env.client.get("/api/v1/admin/vehicles", headers=auth(operator)).status_code == 200
    assert env.client.put("/api/v1/admin/roles/operator", json={"permissions": []}, headers=auth(operator)).status_code == 403
    changes = env.client.get("/api/v1/admin/audit?action=role.permissions_change", headers=auth(admin)).json()["entries"]
    assert len(changes) == 1 and changes[0]["detail"]["after"] == ["fleet.read"]


def test_access_review_flags_inactive_and_privileged_accounts(env):
    admin = make_admin(env)
    signup(env, "never@example.com")
    env.clock[0] += timedelta(days=120)
    admin = sign_in(env, "admin@example.com")["access_token"]
    review = env.client.get("/api/v1/admin/access-review?inactive_days=90", headers=auth(admin)).json()
    flagged = {u["email"]: u["flags"] for u in review["users"]}
    assert "INACTIVE_ACCOUNT" in flagged["never@example.com"]
    assert flagged["admin@example.com"] == ["PRIVILEGED"]
    assert review["summary"]["admins"] == 1 and review["summary"]["flagged"] == 1


def test_tenant_staff_are_confined_to_their_tenant(env):
    platform = make_admin(env)
    t1 = env.client.post("/api/v1/admin/tenants", json={"name": "Taxi Co"}, headers=auth(platform)).json()
    t2 = env.client.post("/api/v1/admin/tenants", json={"name": "Rental Co"}, headers=auth(platform)).json()
    for tenant, vid in ((t1, "T1-CAR"), (t2, "T2-CAR")):
        r = env.client.post("/api/v1/vehicles", json={"vehicle_id": vid, "name": vid, "tenant_id": tenant["tenant_id"]}, headers=auth(platform))
        assert r.status_code == 201, r.text
    tenant_admin = make_admin(env, "t1admin@example.com", tenant_id=t1["tenant_id"])
    ids = [v["vehicle_id"] for v in env.client.get("/api/v1/admin/vehicles", headers=auth(tenant_admin)).json()["items"]]
    assert ids == ["T1-CAR"]
    assert env.client.get("/api/v1/vehicles/T2-CAR/state", headers=auth(tenant_admin)).status_code == 403
    assert env.client.post("/api/v1/admin/tenants", json={"name": "Nope Co"}, headers=auth(tenant_admin)).status_code == 403
    assert env.client.post("/api/v1/admin/users", json={"email": "x@example.com", "password": PASSWORD, "full_name": "X", "role": "admin"}, headers=auth(tenant_admin)).status_code == 403
    mine = env.client.post("/api/v1/admin/users", json={"email": "y@example.com", "password": PASSWORD, "full_name": "Y", "role": "operator"}, headers=auth(tenant_admin)).json()
    assert mine["tenant_id"] == t1["tenant_id"]
    assert [u["email"] for u in env.client.get("/api/v1/admin/users", headers=auth(tenant_admin)).json()["users"]] == ["t1admin@example.com", "y@example.com"]
    assert env.client.get("/api/v1/admin/tenants", headers=auth(tenant_admin)).json()["tenants"][0]["tenant_id"] == t1["tenant_id"]


def test_fleet_search_pagination_and_owner_assignment(env):
    admin = make_admin(env)
    owner_a = user_token(env, "fa@example.com")
    for i in range(5):
        add_vehicle(env, owner_a, f"FLEET-{i}", plate=f"51F-000{i}")
    page1 = env.client.get("/api/v1/admin/vehicles?q=fleet&page=1&page_size=2", headers=auth(admin)).json()
    assert page1["total"] == 5 and [i["vehicle_id"] for i in page1["items"]] == ["FLEET-0", "FLEET-1"]
    assert env.client.get("/api/v1/admin/vehicles?q=51F-0003", headers=auth(admin)).json()["items"][0]["vehicle_id"] == "FLEET-3"
    everything = env.client.get("/api/v1/admin/vehicles?page_size=100", headers=auth(admin)).json()
    assert everything["total"] == 9  # 4 built-in demo + 5 created
    owner_b = user_token(env, "fb@example.com")
    owner_b_id = env.client.get("/api/v1/me/profile", headers=auth(owner_b)).json()["user_id"]
    assert env.client.patch("/api/v1/vehicles/FLEET-0", json={"owner_id": owner_b_id}, headers=auth(admin)).json()["owner_id"] == owner_b_id
    assert [v["vehicle_id"] for v in env.client.get("/api/v1/vehicles", headers=auth(owner_b)).json()["vehicles"]] == ["FLEET-0"]
    assert env.client.get("/api/v1/vehicles/FLEET-0/state", headers=auth(owner_a)).status_code == 403
    env.client.delete("/api/v1/vehicles/FLEET-1", headers=auth(admin))
    retired = env.client.get("/api/v1/admin/vehicles?status=retired", headers=auth(admin)).json()
    assert [i["vehicle_id"] for i in retired["items"]] == ["FLEET-1"]


def test_device_inventory_health_firmware_and_revocation(env):
    admin = make_admin(env)
    owner = user_token(env, "dv@example.com")
    add_vehicle(env, owner, "CAR-DV")
    paired = pair(env, owner, "CAR-DV")
    token = paired["device_token"]
    env.client.post("/api/v1/device/heartbeat", json={"firmware": "1.0.0", "battery_pct": 90}, headers=auth(token))
    env.clock[0] += timedelta(seconds=30)
    env.client.post("/api/v1/device/heartbeat", json={"firmware": "1.0.0", "battery_pct": 89, "status": "DEGRADED"}, headers=auth(token))
    inventory = env.client.get("/api/v1/admin/devices", headers=auth(admin)).json()
    device = inventory["devices"][0]
    assert device["online"] is True and device["last_heartbeat"]["battery_pct"] == 89 and inventory["summary"]["online"] == 1
    beats = env.client.get(f"/api/v1/admin/devices/{paired['device_id']}/heartbeats", headers=auth(admin)).json()["heartbeats"]
    assert [b["battery_pct"] for b in beats] == [89, 90]
    target = env.client.put(f"/api/v1/admin/devices/{paired['device_id']}/firmware", json={"target_firmware": "1.1.0"}, headers=auth(admin)).json()
    assert target["update_pending"] is True
    assert env.client.post("/api/v1/device/heartbeat", json={}, headers=auth(token)).json()["target_firmware"] == "1.1.0"
    env.clock[0] += timedelta(minutes=5)
    assert env.client.get("/api/v1/admin/devices", headers=auth(admin)).json()["devices"][0]["online"] is False
    assert env.client.post(f"/api/v1/admin/devices/{paired['device_id']}/revoke", headers=auth(admin)).json()["status"] == "revoked"
    assert env.client.post("/api/v1/device/heartbeat", json={}, headers=auth(token)).status_code == 403
    assert env.client.post(f"/api/v1/admin/devices/{paired['device_id']}/revoke", headers=auth(make_operator(env))).status_code == 403


def test_ops_incident_assignment_escalation_and_revision_conflicts(env):
    owner = user_token(env, "oi@example.com")
    _, incident = critical_incident(env, owner, "CAR-OI")
    operator = make_operator(env)
    listing = env.client.get("/api/v1/ops/incidents?status=OPEN", headers=auth(operator)).json()
    assert listing["total"] == 1 and listing["items"][0]["vehicle_id"] == "CAR-OI" and listing["items"][0]["ops"]["version"] == 0
    base = f"/api/v1/ops/incidents/{incident['incident_id']}"
    assigned = env.client.post(f"{base}/assign", json={"vehicle_id": "CAR-OI", "version": 0, "assignee": "alice"}, headers=auth(operator)).json()
    assert assigned["assignee"] == "alice" and assigned["ops_status"] == "ASSIGNED" and assigned["version"] == 1
    # A second operator working from the old version is rejected instead of overwriting.
    stale = env.client.post(f"{base}/escalate", json={"vehicle_id": "CAR-OI", "version": 0}, headers=auth(make_admin(env)))
    assert stale.status_code == 409
    escalated = env.client.post(f"{base}/escalate", json={"vehicle_id": "CAR-OI", "version": 1, "note": "no answer"}, headers=auth(operator)).json()
    assert escalated["ops_status"] == "ESCALATED" and escalated["notes"][0]["text"] == "no answer"
    filtered = env.client.get("/api/v1/ops/incidents?assignee=alice&ops_status=ESCALATED", headers=auth(operator)).json()
    assert filtered["total"] == 1
    assert env.client.get("/api/v1/ops/incidents?assignee=bob", headers=auth(operator)).json()["total"] == 0
    assert env.client.post(f"{base}/assign", json={"vehicle_id": "CAR-OI", "version": 2}, headers=auth(operator)).status_code == 422
    assert env.client.post("/api/v1/ops/incidents/nope/assign", json={"vehicle_id": "CAR-OI", "version": 2, "assignee": "x"}, headers=auth(operator)).status_code == 404
    # Operators see the owner's acknowledgement and can acknowledge too.
    assert env.client.post(f"/api/v1/vehicles/CAR-OI/incidents/{incident['incident_id']}/acknowledge", headers=auth(operator)).status_code == 200


def test_ruleset_versioning_validation_and_activation(env):
    admin, operator = make_admin(env), make_operator(env)
    listed = env.client.get("/api/v1/admin/rulesets", headers=auth(operator)).json()["rulesets"]
    assert listed[0]["status"] == "active" and listed[0]["applied_to_engine"] is True
    assert env.client.post("/api/v1/admin/rulesets", json={"version": "v2-test", "params": {"hot_threshold_c": 33.0}}, headers=auth(operator)).status_code == 403
    assert env.client.post("/api/v1/admin/rulesets", json={"version": "v2-bad", "params": {"hot_threshold_c": 5.0}}, headers=auth(admin)).status_code == 422
    assert env.client.post("/api/v1/admin/rulesets", json={"version": "v2-bad2", "params": {"unknown": 1.0}}, headers=auth(admin)).status_code == 422
    created = env.client.post("/api/v1/admin/rulesets", json={"version": "v2-test", "params": {"hot_threshold_c": 33.0}}, headers=auth(admin)).json()
    assert created["status"] == "draft" and created["params"]["min_confidence"] == 0.4 and created["applied_to_engine"] is False
    assert env.client.post("/api/v1/admin/rulesets", json={"version": "v2-test", "params": {}}, headers=auth(admin)).status_code == 409
    active = env.client.post("/api/v1/admin/rulesets/v2-test/activate", headers=auth(admin)).json()
    assert active["status"] == "active" and active["applied_to_engine"] is False
    statuses = {r["version"]: r["status"] for r in env.client.get("/api/v1/admin/rulesets", headers=auth(admin)).json()["rulesets"]}
    assert statuses == {"v2-test": "active", "demo-alerts-2026-09-30": "retired"}
    assert env.client.post("/api/v1/admin/rulesets/ghost/activate", headers=auth(admin)).status_code == 404


def test_model_registry_rollout_and_rollback(env):
    admin = make_admin(env)
    sha = "a" * 64
    m1 = env.client.post("/api/v1/admin/models", json={"name": "cabin-yolo", "version": "1.0", "sha256": sha}, headers=auth(admin)).json()
    m2 = env.client.post("/api/v1/admin/models", json={"name": "cabin-yolo", "version": "1.1"}, headers=auth(admin)).json()
    assert env.client.post("/api/v1/admin/models", json={"name": "cabin-yolo", "version": "1.1"}, headers=auth(admin)).status_code == 409
    assert env.client.post("/api/v1/admin/models", json={"name": "bad", "version": "1", "sha256": "xyz"}, headers=auth(admin)).status_code == 422
    assert env.client.post(f"/api/v1/admin/models/{m1['model_id']}/rollout", json={"rollout_pct": 100}, headers=auth(admin)).json()["status"] == "active"
    canary = env.client.post(f"/api/v1/admin/models/{m2['model_id']}/rollout", json={"rollout_pct": 10}, headers=auth(admin)).json()
    assert canary["status"] == "staged" and canary["rollout_pct"] == 10
    env.clock[0] += timedelta(seconds=1)
    full = env.client.post(f"/api/v1/admin/models/{m2['model_id']}/rollout", json={"rollout_pct": 100}, headers=auth(admin)).json()
    assert full["status"] == "active"
    models = {m["version"]: m["status"] for m in env.client.get("/api/v1/admin/models", headers=auth(admin)).json()["models"]}
    assert models == {"1.0": "retired", "1.1": "active"}
    restored = env.client.post(f"/api/v1/admin/models/{m2['model_id']}/rollback", headers=auth(admin)).json()
    assert restored["version"] == "1.0" and restored["status"] == "active"
    assert env.client.post(f"/api/v1/admin/models/{m1['model_id']}/rollback", headers=auth(admin)).status_code in {200, 409}
    health = env.client.get("/api/v1/admin/system/vision", headers=auth(admin)).json()
    assert "loaded" in health and health["registry_active"]


def test_audit_log_filters_correlation_ids_export_and_retention(env):
    admin = make_admin(env)
    signup(env, "audited@example.com")
    env.client.post("/api/v1/auth/login", json={"email": "audited@example.com", "password": "wrong-password"})
    sign_in(env, "audited@example.com")
    owner = sign_in(env, "audited@example.com")["access_token"]
    r = env.client.post("/api/v1/vehicles", json={"vehicle_id": "AUD-1", "name": "=cmd|' /C calc'!A0"}, headers={**auth(owner), "X-Correlation-ID": "trace-123"})
    assert r.headers["X-Correlation-ID"] == "trace-123"
    by_corr = env.client.get("/api/v1/admin/audit?correlation_id=trace-123", headers=auth(admin)).json()["entries"]
    assert [e["action"] for e in by_corr] == ["vehicle.create"] and by_corr[0]["actor_role"] == "owner"
    denied = env.client.get("/api/v1/admin/audit?action=auth.login", headers=auth(admin)).json()["entries"]
    assert {e["outcome"] for e in denied} == {"ok", "denied"}
    generated = env.client.get("/api/v1/vehicles", headers=auth(admin))
    assert generated.headers["X-Correlation-ID"]
    exported = env.client.get("/api/v1/admin/audit/export?format=csv&action=vehicle.create", headers=auth(admin))
    rows = list(csv.reader(io.StringIO(exported.text)))
    assert rows[0][:3] == ["id", "ts", "actor"] and rows[1][5] == "vehicle.create"
    jsonl = env.client.get("/api/v1/admin/audit/export?format=jsonl", headers=auth(admin))
    assert jsonl.headers["content-type"].startswith("application/x-ndjson") and len(jsonl.text.splitlines()) >= 4
    assert env.client.get("/api/v1/admin/audit?since=2999-01-01T00:00:00%2B00:00", headers=auth(admin)).json()["entries"] == []
    env.clock[0] += timedelta(days=40)
    admin = sign_in(env, "admin@example.com")["access_token"]
    purged = env.client.post("/api/v1/admin/audit/purge", json={"older_than_days": 30}, headers=auth(admin)).json()
    assert purged["removed"] > 0
    assert env.client.post("/api/v1/admin/audit/purge", json={"older_than_days": 1}, headers=auth(admin)).status_code == 422
    remaining = env.client.get("/api/v1/admin/audit?limit=500", headers=auth(admin)).json()["entries"]
    assert all(e["action"] in {"auth.login", "audit.purge"} for e in remaining)


def test_system_monitoring_reports_dependencies_metrics_and_alerts(env):
    from src.cabinsentinel.monitoring import metrics
    admin = make_admin(env)
    for _ in range(25):
        metrics.record("/api/v1/x", 500, 2500.0)
    status = env.client.get("/api/v1/admin/system", headers=auth(admin)).json()
    assert status["dependencies"]["database"] == "ready"
    codes = {a["code"] for a in status["alerts"]}
    assert {"HIGH_LATENCY", "HIGH_ERROR_RATE", "DEPENDENCY_VISION"} <= codes
    assert status["metrics"]["requests"] >= 25 and status["metrics"]["latency_history"]
    assert status["commands_enabled"] is True
