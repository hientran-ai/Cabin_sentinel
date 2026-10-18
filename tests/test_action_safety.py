"""Action-layer contracts: unlock is never executed; replays never re-run actuators."""

from datetime import timedelta

import pytest

from src.cabinsentinel.actions import MockActions
from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.service import CabinService
from tests.fleet_helpers import NOW, sensor, vision

VEHICLE = "VF8-DEMO-01"


class SpyActions(MockActions):
    def __init__(self):
        self.calls = []

    def execute(self, tool, vehicle_id):
        self.calls.append(tool)
        return super().execute(tool, vehicle_id)


@pytest.fixture
def rig(tmp_path):
    clock = [NOW]
    spy = SpyActions()
    service = CabinService(tmp_path / "actions.db", clock=lambda: clock[0], actions=spy)
    yield service, spy, clock
    service._db.close()


def publish(service, clock, step, scenario):
    service.ingest_sensor(SensorPayload(**sensor(VEHICLE, clock[0], step, scenario)))
    return service.ingest_vision(VisionPayload(**vision(VEHICLE, clock[0], step, scenario)))


def test_unlock_is_never_executed_through_a_long_critical_incident(rig):
    service, spy, clock = rig
    state = publish(service, clock, 1, "CRITICAL")
    unlock = next(a for a in state["action_results"] if a["tool"] == "request_unlock")
    assert unlock["status"] == "pending_human_confirmation"
    # Keep the incident CRITICAL past the unlock expiry, SMS escalation and repeats.
    for step in range(2, 200):
        clock[0] += timedelta(seconds=1)
        publish(service, clock, step, "CRITICAL")
    final = service.get_state_with_freshness(VEHICLE)
    assert final["risk_level"] == "CRITICAL"
    assert final["unlock_request"]["status"] == "expired"
    assert "request_unlock" not in spy.calls  # never handed to an actuator adapter
    ledger = [row for row in final["action_ledger"] if row["tool"] == "request_unlock"]
    assert ledger and {row["status"] for row in ledger} == {"pending_human_confirmation"}
    results = service.events(VEHICLE, event_type="action_result", limit=500)
    assert all(r["status"] != "executed" for r in results)
    assert {r["status"] for r in results if r["tool"] == "request_unlock"} == {"pending_human_confirmation"}


def test_replaying_the_same_logical_input_never_reruns_actuators(rig):
    service, spy, clock = rig
    publish(service, clock, 1, "CRITICAL")
    first = list(spy.calls)
    assert sorted(first) == ["send_notification", "send_sms", "trigger_horn"]  # initial owner alert + CRITICAL tools
    for _ in range(5):
        publish(service, clock, 1, "CRITICAL")  # same sequence + same frame id
    assert spy.calls == first
    keys = [row["action_key"] for row in service.get_state_with_freshness(VEHICLE)["action_ledger"]]
    assert len(keys) == len(set(keys))


def test_human_cabin_check_resolves_without_turning_negative_vision_safe(rig):
    service, spy, clock = rig
    state = publish(service, clock, 1, "CRITICAL")
    incident = state["incident"]["incident_id"]
    with pytest.raises(ValueError):
        service.resolve(VEHICLE, incident, state["revision"], cabin_checked=True)
    clock[0] += timedelta(seconds=1)
    uncertain = publish(service, clock, 2, "NO_OCCUPANT_DETECTION")
    assert uncertain["risk_level"] == "ERROR"
    assert uncertain["occupancy_state"] == "UNKNOWN"
    with pytest.raises(ValueError, match="Explicit cabin check"):
        service.resolve(VEHICLE, incident, uncertain["revision"], cabin_checked=False)
    resolved = service.resolve(VEHICLE, incident, uncertain["revision"], cabin_checked=True)
    assert resolved["incident"]["status"] == "RESOLVED"
    assert resolved["risk_level"] == "ERROR"
    assert resolved["occupancy_state"] == "UNKNOWN"
    assert resolved["unlock_request"]["status"] in {"canceled", "expired"}
    assert "request_unlock" not in spy.calls
