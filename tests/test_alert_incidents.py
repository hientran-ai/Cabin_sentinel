"""Observable incident/timing guarantees with a fake UTC clock and real SQLite."""

from datetime import timedelta

from src.cabinsentinel.service import CabinService
from tests.test_cabinsentinel import NOW, sensor, vision


def occupied(service, clock, *, temp=25, seq=1):
    service.ingest_sensor(sensor(temp, at=clock[0], sequence=seq))
    return service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}], at=clock[0], frame_id=f"f-{seq}"))


def test_incident_survives_cooling_stale_and_restart(tmp_path):
    clock = [NOW]
    db = tmp_path / "state.db"
    service = CabinService(db, clock=lambda: clock[0])
    hot = occupied(service, clock, temp=35)
    clock[0] += timedelta(seconds=1)
    cool = occupied(service, clock, seq=2)
    assert cool["risk_level"] == "WARNING"
    assert cool["incident_id"] == hot["incident_id"]
    assert cool["incident"]["status"] == "OPEN"
    clock[0] += timedelta(seconds=6)
    stale = service.tick("CAR_1")
    assert stale["risk_level"] == "ERROR"
    assert stale["data_quality"]["status"] == "STALE"
    assert stale["incident_id"] == hot["incident_id"]
    restarted = CabinService(db, clock=lambda: clock[0])
    assert restarted.get_state("CAR_1")["incident"]["status"] == "OPEN"
    assert restarted.tick("CAR_1")["incident_id"] == hot["incident_id"]


def test_escalation_before_deadline_is_channel_change_not_risk_change(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    assert first["alert"]["initial_ends_at"] == (NOW + timedelta(seconds=3)).isoformat()
    clock[0] = NOW + timedelta(seconds=91.999)
    before = occupied(service, clock, seq=2)
    assert before["alert"]["stage"] == "INITIAL"
    clock[0] = NOW + timedelta(seconds=92)
    after = occupied(service, clock, seq=3)
    assert after["risk_level"] == "WARNING"
    assert after["alert"]["stage"] == "ESCALATED"
    assert after["incident_id"] == first["incident_id"]
    results = service.events("CAR_1", event_type="action_result", limit=500)
    assert sum(x["tool"] == "send_sms" for x in results) == 1
    assert all(x["status"] == "simulated" for x in results)
    count = len(results)
    service.tick("CAR_1")
    assert len(service.events("CAR_1", event_type="action_result", limit=500)) == count


def test_repeat_at_60_seconds_and_after_20_minutes_without_packets(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    for seconds in (58.999, 60, 1200, 1260):
        clock[0] = NOW + timedelta(seconds=seconds)
        state = service.tick("CAR_1")
        assert state["incident_id"] == first["incident_id"]
        assert state["risk_level"] != "SAFE"
        if seconds == 58.999:
            assert state["alert"]["repeat_count"] == 0
        else:
            assert state["alert"]["last_sent_at"] == clock[0].isoformat()
    assert state["alert"]["repeat_count"] == 3
    assert state["data_quality"]["status"] == "STALE"


def test_fresh_empty_frame_and_ack_do_not_resolve_existing_incident(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    clock[0] += timedelta(seconds=1)
    service.ingest_sensor(sensor(at=clock[0], sequence=2))
    empty = service.ingest_vision(vision([], at=clock[0], frame_id="empty"))
    assert empty["risk_level"] == "ERROR"
    assert empty["occupancy_state"] == "UNKNOWN"
    assert empty["rule_id"] == "OCCUPANCY_UNVERIFIED"
    assert empty["incident_id"] == first["incident_id"]
    ack = service.acknowledge("CAR_1", first["incident_id"])
    assert ack["incident"]["acknowledged_at"] == clock[0].isoformat()
    assert ack["incident"]["status"] == "OPEN"
    assert ack["unlock_request"] is None


def test_lock_event_latency_is_measured_without_assuming_snapshot_is_lock(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    assert first["alert"]["lock_timing"]["status"] == "UNKNOWN"
    clock[0] += timedelta(seconds=1)
    state = service.ingest_sensor(
        sensor(at=clock[0], sequence=2, locked_at=NOW, lock_event_id="lock-1", lock_event_source="SIMULATED")
    )
    assert state["alert"]["lock_timing"]["latency_s"] == 0
    assert state["alert"]["lock_timing"]["source"] == "SIMULATED"
    assert state["incident_id"] == first["incident_id"]


def test_pet_mode_without_attendant_still_warns_immediately(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(
        sensor(28, engine="ON", powertrain_type="EV", operation_mode="PET", hvac_status="ACTIVE", battery_soc_pct=40)
    )
    state = service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    assert state["risk_level"] == "WARNING"
    assert state["incident"]["status"] == "OPEN"


def test_old_v1_occupied_incident_migrates_without_claiming_safe(tmp_path):
    import json

    db = tmp_path / "state.db"
    service = CabinService(db, clock=lambda: NOW)
    state = occupied(service, [NOW])
    old_id = state["incident_id"]
    for field in ("incident", "alert", "data_quality", "ruleset_version"):
        state.pop(field)
    with service._db:
        service._db.execute("UPDATE vehicles SET state_json=? WHERE vehicle_id=?", (json.dumps(state), "CAR_1"))
    migrated = CabinService(db, clock=lambda: NOW).tick("CAR_1")
    assert migrated["incident_id"] == old_id
    assert migrated["incident"]["migration"] == "LEGACY_TIMING_UNKNOWN"
    assert migrated["alert"]["temporal_origin"] == "LEGACY_TIMING_UNKNOWN"
    assert migrated["risk_level"] == "WARNING"


def test_confirmed_moving_driver_with_pet_mode_does_not_open_unattended_incident(tmp_path):
    service = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    service.ingest_sensor(
        sensor(
            28,
            engine="ON",
            powertrain_type="EV",
            operation_mode="PET",
            hvac_status="ACTIVE",
            battery_soc_pct=40,
            driver_present=True,
            gear="D",
            vehicle_speed_kph=20,
        )
    )
    state = service.ingest_vision(vision([{"class_name": "dog", "confidence": 0.9}]))
    assert state["risk_level"] == "SAFE"
    assert state["incident"] is None


def test_a_new_lock_event_reissues_warning_without_resetting_incident_deadline(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    clock[0] += timedelta(seconds=1)
    locked = service.ingest_sensor(
        sensor(at=clock[0], sequence=2, locked_at=clock[0], lock_event_id="fresh-lock", lock_event_source="SIMULATED")
    )
    assert locked["incident_id"] == first["incident_id"]
    assert locked["alert"]["escalation_due_at"] == first["alert"]["escalation_due_at"]
    assert locked["alert"]["lock_timing"]["warning_sent_at"] == clock[0].isoformat()
    assert locked["alert"]["lock_timing"]["latency_s"] == 0
    assert [action["tool"] for action in locked["action_results"]] == ["send_notification"]


def test_every_minute_is_repeated_through_and_beyond_twenty_minutes(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    initial = occupied(service, clock)
    for minute in range(1, 22):
        clock[0] = NOW + timedelta(minutes=minute)
        state = service.tick("CAR_1")
        assert state["incident_id"] == initial["incident_id"]
        assert state["incident"]["status"] == "OPEN"
        assert state["alert"]["repeat_count"] == minute
        assert state["alert"]["last_sent_at"] == clock[0].isoformat()
        assert state["risk_level"] == "ERROR"  # sources stale, never pretend SAFE


def test_one_hertz_timer_has_dispatch_margin_before_notification_deadlines(tmp_path):
    clock = [NOW]
    service = CabinService(tmp_path / "state.db", clock=lambda: clock[0])
    first = occupied(service, clock)
    clock[0] = NOW + timedelta(seconds=59.5)
    repeated = service.tick("CAR_1")
    assert repeated["alert"]["repeat_count"] == 1
    assert repeated["alert"]["next_repeat_at"] == (NOW + timedelta(seconds=120)).isoformat()
    clock[0] = NOW + timedelta(seconds=92.5)
    escalated = service.tick("CAR_1")
    assert escalated["alert"]["stage"] == "ESCALATED"
    assert escalated["alert"]["escalation_target_met"] is True
    assert escalated["alert"]["escalation_latency_s"] == 89.5
    assert escalated["alert"]["escalation_deadline_at"] == (NOW + timedelta(seconds=93)).isoformat()
    assert escalated["incident_id"] == first["incident_id"]
