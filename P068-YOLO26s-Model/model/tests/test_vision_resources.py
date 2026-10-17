"""Admission and shutdown behavior without model weights or GPU requirements."""

from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from p068_vision.resources import ResourceBusyError, ResourceLayer


def test_failure_releases_slot_and_preserves_counters():
    layer = ResourceLayer()
    with pytest.raises(ValueError):
        with layer.execution():
            raise ValueError("bad frame")
    with layer.execution() as record:
        assert layer.snapshot()["active"] == 1
    assert record["status"] == "ok"
    assert record["execution_ms"] >= 0
    assert "process_rss_bytes" in record["after"]
    assert layer.snapshot()["failed"] == 1
    assert layer.snapshot()["completed"] == 1
    assert layer.snapshot()["state"] == "idle"


def test_queue_bound_and_timeout():
    layer = ResourceLayer(max_waiting=1, wait_timeout=0.02)
    with layer.execution():
        with ThreadPoolExecutor(max_workers=1) as pool:
            def waiting():
                with layer.execution():
                    pytest.fail("concurrent execution admitted")
            with pytest.raises(ResourceBusyError, match="timed out"):
                pool.submit(waiting).result(timeout=2)
    assert layer.snapshot()["waiting"] == 0
    assert layer.snapshot()["rejected"] == 1
    layer = ResourceLayer(max_waiting=0)
    with layer.execution():
        with pytest.raises(ResourceBusyError, match="queue full"):
            with layer.execution():
                pytest.fail("queue bound exceeded")


def test_close_drains_active_execution_and_rejects_new_work():
    layer = ResourceLayer()
    entered, release, closing = Event(), Event(), Event()

    def run():
        with layer.execution():
            entered.set()
            assert release.wait(2)

    def close():
        closing.set()
        layer.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        running = pool.submit(run)
        assert entered.wait(2)
        shutdown = pool.submit(close)
        assert closing.wait(2)
        assert not shutdown.done()
        release.set()
        running.result(timeout=2)
        shutdown.result(timeout=2)
    with pytest.raises(ResourceBusyError, match="closed"):
        with layer.execution():
            pytest.fail("closed runtime admitted work")
    assert layer.snapshot()["state"] == "closed"


@pytest.mark.parametrize("kwargs", [{"max_waiting": -1}, {"wait_timeout": 0}, {"wait_timeout": float("nan")}])
def test_invalid_limits(kwargs):
    with pytest.raises(ValueError):
        ResourceLayer(**kwargs)
