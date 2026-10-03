"""Camera lifecycle uses the real SQLite service; only inference is substituted."""

import importlib
import importlib.util
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Event

import pytest
from PIL import Image

from src.cabinsentinel.service import CabinService


NOW = datetime(2026, 10, 2, 9, tzinfo=timezone.utc)


@pytest.fixture
def setup(tmp_path):
    # Fails explicitly until the new feature exists, rather than during collection.
    assert importlib.util.find_spec("src.cabinsentinel.camera") is not None, "Camera sessions are missing"
    module = importlib.import_module("src.cabinsentinel.camera")
    clock = [NOW]
    service = CabinService(tmp_path / "camera.db", clock=lambda: clock[0])
    sessions = module.CameraSessions(service)
    yield sessions, service, clock, module.CameraError
    service._db.close()


def detector(_image):
    return {
        "timestamp": NOW.isoformat(), "frame_id": 1,
        "detections": [{"class": "person", "confidence": 0.9}], "latency_ms": 1,
    }


def send(sessions, creds, clock, *, sequence=1, infer=detector, captured_at=None):
    return sessions.frame(
        creds["session_id"], creds["session_token"], Image.new("RGB", (32, 32)),
        sequence, captured_at or clock[0].isoformat(), infer,
    )


@pytest.mark.parametrize("source", ["browser", "raspberry_pi"])
def test_start_without_a_frame_is_not_safe(setup, source):
    sessions, service, _, _ = setup
    result = sessions.start("hot_locked", source)
    assert result["risk_level"] == "ERROR"
    assert result["camera_status"] == "NO_FEED"
    assert result["decision_current"] is False
    assert result["camera"]["requested"] == "RUNNING"
    assert result["camera"]["device_reported"] == "UNKNOWN"
    assert result["simulation"]["vehicle_source"] == "SIMULATED"
    assert service.get_state("DEMO_" + result["session_id"])["revision"] == 1


def test_consecutive_frames_share_session_and_incident(setup):
    sessions, service, clock, _ = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock)
    clock[0] += timedelta(seconds=1)
    second = send(sessions, creds, clock, sequence=2)
    assert first["session_id"] == second["session_id"]
    assert first["risk_level"] == second["risk_level"] == "CRITICAL"
    assert first["incident_id"] == second["incident_id"]
    assert second["revision"] == first["revision"] + 1
    assert second["decision_current"] is True
    assert second["camera"]["device_reported"] == "CAPTURING"
    assert second["camera"]["inference_busy"] is False
    assert "session_token" not in second
    assert all(a["status"] != "success" for a in second["actions"])


def test_duplicate_frame_never_replays_actions_or_revision(setup):
    sessions, service, clock, _ = setup
    creds = sessions.start("hot_locked", "raspberry_pi")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock)
    before = service.events("DEMO_" + creds["session_id"])
    repeated = send(sessions, creds, clock)
    assert repeated["revision"] == first["revision"]
    assert repeated["frame_result"] == "DUPLICATE"
    assert service.events("DEMO_" + creds["session_id"]) == before


def test_out_of_order_or_reused_frame_id_is_rejected(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock, sequence=2)
    clock[0] += timedelta(seconds=1)
    with pytest.raises(error, match="OUT_OF_ORDER"):
        send(sessions, creds, clock, sequence=1)
    with pytest.raises(error, match="FRAME_CONFLICT"):
        send(sessions, creds, clock, sequence=2)
    assert service.get_state("DEMO_" + creds["session_id"])["revision"] == first["revision"]


@pytest.mark.parametrize("operation", ["status", "stop", "frame", "report"])
def test_wrong_token_cannot_control_or_read_camera(setup, operation):
    sessions, _, clock, error = setup
    creds = sessions.start("normal", "browser")
    with pytest.raises(error, match="UNAUTHORIZED"):
        if operation == "frame":
            send(sessions, {**creds, "session_token": "wrong"}, clock)
        elif operation == "report":
            sessions.report(creds["session_id"], "wrong", "ERROR")
        else:
            getattr(sessions, operation)(creds["session_id"], "wrong")


def test_stop_invalidates_feed_without_claiming_hardware_stopped(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("hot_locked", "raspberry_pi")
    clock[0] += timedelta(seconds=1)
    send(sessions, creds, clock)
    clock[0] += timedelta(seconds=1)
    stopped = sessions.stop(creds["session_id"], creds["session_token"])
    assert stopped["camera"]["requested"] == "STOPPED"
    assert stopped["camera"]["device_reported"] == "CAPTURING"
    assert stopped["camera_status"] == "NO_FEED"
    assert stopped["decision_current"] is False
    assert stopped["risk_level"] != "SAFE"
    repeated = sessions.stop(creds["session_id"], creds["session_token"])
    assert repeated["revision"] == stopped["revision"]
    with pytest.raises(error, match="STOPPED"):
        send(sessions, creds, clock, sequence=2)
    confirmed = sessions.report(creds["session_id"], creds["session_token"], "STOPPED")
    assert confirmed["camera"]["device_reported"] == "STOPPED"
    assert confirmed["revision"] == stopped["revision"]


def test_stop_wins_over_inflight_inference(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)
    entered, release = Event(), Event()

    def blocked(image):
        entered.set()
        assert release.wait(5)
        return detector(image)

    with ThreadPoolExecutor() as executor:
        pending = executor.submit(send, sessions, creds, clock, infer=blocked)
        assert entered.wait(5)
        clock[0] += timedelta(seconds=1)
        stopped = sessions.stop(creds["session_id"], creds["session_token"])
        release.set()
        with pytest.raises(error, match="STOPPED"):
            pending.result(timeout=5)
    assert service.get_state("DEMO_" + creds["session_id"])["revision"] == stopped["revision"]


def test_expired_frame_is_not_retimestamped_after_inference(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("normal", "browser")
    clock[0] += timedelta(seconds=1)

    def slow(image):
        clock[0] += timedelta(seconds=4)
        return detector(image)

    with pytest.raises(error, match="STALE_FRAME"):
        send(sessions, creds, clock, infer=slow)
    state = service.get_state("DEMO_" + creds["session_id"])
    assert state["camera_status"] == "NO_FEED"
    assert state["revision"] == 1
    assert state["risk_level"] != "SAFE"


def test_reads_report_stale_without_writing_and_timer_reassesses(setup):
    sessions, service, clock, _ = setup
    creds = sessions.start("normal", "browser")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock)
    clock[0] += timedelta(seconds=4)
    stale = sessions.status(creds["session_id"], creds["session_token"])
    assert stale["decision_current"] is False
    assert stale["freshness"]["vision"]["status"] == "STALE"
    assert stale["revision"] == first["revision"]
    sessions.tick_all()
    after = sessions.status(creds["session_id"], creds["session_token"])
    assert after["revision"] > first["revision"]
    assert after["risk_level"] != "SAFE"


def test_inference_failure_is_explicit_camera_error(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("normal", "browser")
    clock[0] += timedelta(seconds=1)

    def broken(_image):
        raise RuntimeError("model broken")

    with pytest.raises(error, match="INFERENCE_UNAVAILABLE"):
        send(sessions, creds, clock, infer=broken)
    state = service.get_state("DEMO_" + creds["session_id"])
    assert state["camera_status"] == "ERROR"
    assert state["risk_level"] != "SAFE"


@pytest.mark.parametrize("timestamp", ["bad", "2026-10-02T09:00:00", "2026-10-02T09:00:05+00:00"])
def test_invalid_or_future_capture_time_is_rejected_before_inference(setup, timestamp):
    sessions, service, clock, error = setup
    creds = sessions.start("normal", "browser")
    clock[0] += timedelta(seconds=1)
    with pytest.raises(error):
        send(sessions, creds, clock, captured_at=timestamp)
    assert service.get_state("DEMO_" + creds["session_id"])["revision"] == 1


def test_process_restart_does_not_resume_an_old_camera_session(setup):
    sessions, service, _, error = setup
    creds = sessions.start("normal", "browser")
    restarted = type(sessions)(service)
    with pytest.raises(error, match="SESSION_NOT_FOUND"):
        restarted.status(creds["session_id"], creds["session_token"])


@pytest.mark.parametrize("scenario,source", [("typo", "browser"), ("normal", "unknown")])
def test_invalid_start_does_not_silently_choose_normal(setup, scenario, source):
    sessions, _, _, error = setup
    with pytest.raises(error, match="INVALID_INPUT"):
        sessions.start(scenario, source)


def test_camera_result_keeps_yolo_boxes_capture_time_and_latency(setup):
    sessions, _, clock, _ = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)

    def boxed(image):
        frame = detector(image)
        frame["detections"][0]["bbox"] = [1, 2, 20, 30]
        return frame

    result = send(sessions, creds, clock, infer=boxed)
    assert result["vision_detections"][0]["bbox"] == [1, 2, 20, 30]
    assert result["frame"]["width"] == result["frame"]["height"] == 32
    assert result["frame"]["captured_at"] == clock[0].isoformat()
    assert result["frame"]["latency_ms"] == 1


def test_camera_error_report_invalidates_inflight_result(setup):
    sessions, _, clock, error = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)
    entered, release = Event(), Event()

    def blocked(image):
        entered.set()
        assert release.wait(5)
        return detector(image)

    with ThreadPoolExecutor() as executor:
        pending = executor.submit(send, sessions, creds, clock, infer=blocked)
        assert entered.wait(5)
        clock[0] += timedelta(seconds=1)
        reported = sessions.report(creds["session_id"], creds["session_token"], "DISCONNECTED")
        release.set()
        with pytest.raises(error, match="CAMERA_CHANGED"):
            pending.result(timeout=5)
    assert reported["risk_level"] != "SAFE"
    assert reported["decision_current"] is False


def test_stop_with_nonadvancing_clock_fails_explicit_but_blocks_new_frames(setup):
    sessions, service, clock, error = setup
    creds = sessions.start("normal", "browser")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock)
    with pytest.raises(error, match="STATE_NOT_COMMITTED"):
        sessions.stop(creds["session_id"], creds["session_token"])
    state = sessions.status(creds["session_id"], creds["session_token"])
    assert state["decision_current"] is False
    assert state["camera"]["requested"] == "STOPPED"
    with pytest.raises(error, match="STOPPED"):
        send(sessions, creds, clock, sequence=2)
    clock[0] += timedelta(seconds=1)
    sessions.tick_all()
    state = sessions.status(creds["session_id"], creds["session_token"])
    assert state["camera_status"] == "NO_FEED"
    assert state["risk_level"] != "SAFE"


def test_camera_reads_keep_action_receipts_after_the_first_frame(setup):
    sessions, _, clock, _ = setup
    creds = sessions.start("hot_locked", "browser")
    clock[0] += timedelta(seconds=1)
    first = send(sessions, creds, clock, sequence=1)
    clock[0] += timedelta(seconds=1)
    second = send(sessions, creds, clock, sequence=2)
    assert {a["tool"] for a in first["actions"]} >= {"trigger_horn", "send_sms", "request_unlock"}
    assert second["actions"] == []  # not replayed
    ledger = {row["tool"]: row["status"] for row in second["action_ledger"]}
    assert ledger["trigger_horn"] == "simulated" and ledger["request_unlock"] == "pending_human_confirmation"
    assert second["unlock_request"]["status"] == "pending"
