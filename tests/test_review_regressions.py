"""Regression checks for PR #1 concurrency and shutdown review."""

import threading
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime

import pytest

from src.cabinsentinel.models import SensorPayload, VisionPayload
from src.cabinsentinel.mqtt import SensorSubscriber
from src.cabinsentinel.service import CabinService

NOW = datetime(2026, 9, 26, tzinfo=UTC)


def sensor():
    return SensorPayload(vehicle_id="CAR_1", timestamp=NOW, sequence=1,
                         temperature=35, engine_status="OFF", doors_locked=True,
                         radar_presence=True)


def vision():
    return VisionPayload(vehicle_id="CAR_1", timestamp=NOW, frame_id="1",
                         camera_status="OK", detected_objects=[])


def test_two_connections_preserve_both_sources_and_revisions(tmp_path):
    first_read = threading.Event()
    release_first = threading.Event()
    second_started = threading.Event()
    second_read = threading.Event()

    def first_clock():
        first_read.set()
        assert release_first.wait(3)
        return NOW

    def second_clock():
        second_read.set()
        return NOW

    first = CabinService(tmp_path / "state.db", clock=first_clock)
    second = CabinService(tmp_path / "state.db", clock=second_clock)

    def write_second():
        second_started.set()
        return second.ingest_vision(vision())

    with ThreadPoolExecutor(2) as pool:
        a = pool.submit(first.ingest_sensor, sensor())
        try:
            assert first_read.wait(3)
            b = pool.submit(write_second)
            assert second_started.wait(3)
            # A second writer must not read the old snapshot while the first owns it.
            read_before_commit = second_read.wait(0.2)
        finally:
            release_first.set()
        a.result(timeout=3)
        b.result(timeout=3)
    state = second.get_state("CAR_1")
    assert state["revision"] == 2
    assert state["temperature"] == 35
    assert state["camera_status"] == "OK"
    assert state["risk_level"] == "WARNING"
    assert not read_before_commit


def test_delayed_action_result_cannot_overwrite_newer_decision(tmp_path):
    entered = threading.Event()
    release = threading.Event()

    class SlowActions:
        def execute(self, tool, vehicle_id):
            entered.set()
            assert release.wait(3)
            return {"tool": tool, "vehicle_id": vehicle_id, "status": "simulated"}

    first = CabinService(tmp_path / "state.db", clock=lambda: NOW, actions=SlowActions())
    second = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    first.ingest_vision(vision())
    with ThreadPoolExecutor(1) as pool:
        future = pool.submit(first.ingest_sensor, sensor())
        try:
            assert entered.wait(3)
            newer = second.ingest_vision(vision().model_copy(update={
                "frame_id": "2", "timestamp": NOW.replace(microsecond=1),
            }))
        finally:
            release.set()
        older = future.result(timeout=3)
    assert older["revision"] == 2
    assert newer["revision"] == 3
    assert second.get_state("CAR_1")["revision"] == 3
    assert any(e["revision"] == 2 for e in second.events("CAR_1", event_type="action_result"))


def test_shutdown_reports_worker_still_running_without_waiting_for_queue_space():
    entered = threading.Event()
    release = threading.Event()
    finished = threading.Event()
    errors = []
    processed = []

    class BlockedService:
        def ingest_sensor(self, payload):
            entered.set()
            assert release.wait(8)
            processed.append(payload)

        def tick_all(self):
            pass

    subscriber = SensorSubscriber(BlockedService())
    subscriber.queue.put(sensor())
    subscriber._worker = threading.Thread(target=subscriber._run, daemon=True)
    subscriber._worker.start()
    assert entered.wait(3)
    for _ in range(256):
        subscriber.queue.put_nowait(sensor())

    def stop():
        try:
            subscriber.stop()
        except Exception as exc:
            errors.append(exc)
        finally:
            finished.set()

    stopper = threading.Thread(target=stop, daemon=True)
    stopper.start()
    try:
        returned = finished.wait(3)
    finally:
        release.set()
        stopper.join(4)
        subscriber._worker.join(4)
    assert returned, "stop blocked on a full queue"
    assert len(errors) == 1 and isinstance(errors[0], TimeoutError)
    assert not subscriber._worker.is_alive()
    assert subscriber.queue.unfinished_tasks == 0
    assert len(processed) == 257


def test_idle_worker_stops_and_repeated_stop_is_safe():
    class IdleService:
        def tick_all(self):
            pass

    subscriber = SensorSubscriber(IdleService())
    subscriber._worker = threading.Thread(target=subscriber._run, daemon=True)
    subscriber._worker.start()
    subscriber.stop()
    subscriber.stop()
    assert not subscriber._worker.is_alive()
    assert subscriber.queue.unfinished_tasks == 0


def test_failed_evaluation_releases_database_writer(tmp_path):
    first = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    second = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    with pytest.raises(ValueError):
        first.ingest_sensor(sensor().model_copy(update={"timestamp": NOW.replace(second=10)}))
    assert second.ingest_sensor(sensor())["revision"] == 1


def test_stopped_subscriber_rejects_new_packets():
    subscriber = SensorSubscriber(CabinService(":memory:", clock=lambda: NOW))
    subscriber.stop()
    assert not subscriber.accept_packet("cabinsentinel/CAR_1/sensors", sensor().model_dump_json().encode())
    assert subscriber.queue.empty()


def test_duplicate_ingress_across_connections_does_not_repeat_intents(tmp_path):
    first = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    second = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    first.ingest_vision(vision())
    barrier = threading.Barrier(2)

    def ingest(service):
        barrier.wait(timeout=3)
        return service.ingest_sensor(sensor())

    with ThreadPoolExecutor(2) as pool:
        a = pool.submit(ingest, first)
        b = pool.submit(ingest, second)
        assert a.result(timeout=3)["revision"] == b.result(timeout=3)["revision"] == 2
    assert len(second.events("CAR_1", event_type="evaluation")) == 2
    assert len(second.events("CAR_1", event_type="action_intent")) == 1
    assert len(second.events("CAR_1", event_type="action_result")) == 1
    # Duplicate and no-op timer returns must release the writer transaction.
    first.tick("CAR_1")
    assert second.ingest_vision(vision().model_copy(update={
        "frame_id": "2", "timestamp": NOW.replace(microsecond=1),
    }))["revision"] == 3


def test_event_failure_rolls_back_state_and_releases_writer(tmp_path, monkeypatch):
    first = CabinService(tmp_path / "state.db", clock=lambda: NOW)
    second = CabinService(tmp_path / "state.db", clock=lambda: NOW)

    def fail_event(*args):
        raise RuntimeError("audit unavailable")

    monkeypatch.setattr(first, "_event", fail_event)
    with pytest.raises(RuntimeError, match="audit unavailable"):
        first.ingest_sensor(sensor())
    assert second.get_state("CAR_1") is None
    assert second.ingest_sensor(sensor())["revision"] == 1
