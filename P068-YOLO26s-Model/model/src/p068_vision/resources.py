"""Bounded inference admission and optional process/CUDA memory snapshots."""

from contextlib import contextmanager
from math import isfinite
from threading import Condition, Event, Lock, Thread
from time import monotonic
from weakref import finalize


class ResourceBusyError(RuntimeError):
    """The runtime is closed, its queue is full, or waiting timed out."""


class ResourceLayer:
    """Own one model execution slot; queued callers retain their input bytes only.

    CPU/RAM readings are process/system scoped. CUDA memory is allocator-scoped,
    not GPU utilization. Optional telemetry failures never break inference.
    """

    def __init__(self, *, max_waiting=4, wait_timeout=30.0, sample_interval=1.0):
        if isinstance(max_waiting, bool) or not isinstance(max_waiting, int) or max_waiting < 0:
            raise ValueError("max_waiting must be a non-negative integer")
        if not isfinite(wait_timeout) or wait_timeout <= 0:
            raise ValueError("wait_timeout must be finite and positive")
        if not isfinite(sample_interval) or sample_interval < .2:
            raise ValueError("sample_interval must be finite and >= 0.2 seconds")
        self.sample_interval = sample_interval
        self._sample_stop = Event()
        self._sample_lock = Lock()
        self._sample_thread = None
        self._sample_cache = {"value": None, "at": None}
        finalize(self, self._sample_stop.set)
        self.max_waiting = max_waiting
        self.wait_timeout = wait_timeout
        self._condition = Condition()
        self._active = False
        self._waiting = 0
        self._closed = False
        self._completed = 0
        self._failed = 0
        self._rejected = 0
        self._last = None

    @staticmethod
    def memory_snapshot():
        import sys

        result = {"process_rss_bytes": None, "ram_available_bytes": None,
                  "process_cpu_seconds": None, "process_threads": None, "cuda": []}
        try:
            import psutil

            process = psutil.Process()
            result["process_rss_bytes"] = process.memory_info().rss
            cpu = process.cpu_times()
            result["process_cpu_seconds"] = cpu.user + cpu.system
            result["process_threads"] = process.num_threads()
            result["ram_available_bytes"] = psutil.virtual_memory().available
        except Exception as exc:
            result["process_error"] = type(exc).__name__
        # Do not import torch or initialize CUDA just to collect telemetry.
        torch = sys.modules.get("torch")
        try:
            if torch is not None and torch.cuda.is_initialized():
                for device in range(torch.cuda.device_count()):
                    result["cuda"].append({
                        "device": device,
                        "allocated_bytes": torch.cuda.memory_allocated(device),
                        "reserved_bytes": torch.cuda.memory_reserved(device),
                    })
        except Exception as exc:
            result["cuda_error"] = type(exc).__name__
        return result

    @staticmethod
    def _sample_loop(stop, lock, cache, interval):
        from datetime import UTC, datetime
        while not stop.is_set():
            reading = ResourceLayer.memory_snapshot()
            reading["sampled_at_utc"] = datetime.now(UTC).isoformat()
            with lock:
                cache.update(value=reading, at=monotonic())
            stop.wait(interval)

    def start_sampling(self):
        with self._condition:
            if self._closed:
                raise ResourceBusyError("Vision runtime closed")
            if self._sample_thread is None:
                self._sample_thread = Thread(
                    target=ResourceLayer._sample_loop,
                    args=(self._sample_stop, self._sample_lock, self._sample_cache, self.sample_interval),
                    daemon=True, name="vision-resource-sampler",
                )
                self._sample_thread.start()

    def telemetry_snapshot(self):
        with self._sample_lock:
            value = self._sample_cache["value"]
            if value is None:
                return {"process_rss_bytes": None, "ram_available_bytes": None,
                        "process_cpu_seconds": None, "process_threads": None, "cuda": [],
                        "sampled_at_utc": None, "sample_age_ms": None, "status": "pending"}
            return {**value, "sample_age_ms": (monotonic() - self._sample_cache["at"]) * 1000}

    @contextmanager
    def execution(self):
        started = monotonic()
        with self._condition:
            if self._closed or (self._active and self._waiting >= self.max_waiting):
                self._rejected += 1
                raise ResourceBusyError("Vision runtime closed or queue full")
            self._waiting += 1
            try:
                while self._active and not self._closed:
                    remaining = self.wait_timeout - (monotonic() - started)
                    if remaining <= 0:
                        self._rejected += 1
                        raise ResourceBusyError("Vision runtime wait timed out")
                    self._condition.wait(remaining)
                if self._closed:
                    self._rejected += 1
                    raise ResourceBusyError("Vision runtime closed")
                self._active = True
            finally:
                self._waiting -= 1
        acquired = monotonic()
        record = {"wait_ms": (acquired - started) * 1000, "before": self.telemetry_snapshot()}
        failed = True
        try:
            yield record
            failed = False
        finally:
            record["execution_ms"] = (monotonic() - acquired) * 1000
            record["after"] = self.telemetry_snapshot()
            # Periodic samples may straddle requests; no per-request CPU attribution.
            record["process_cpu_seconds_delta"] = None
            record["status"] = "error" if failed else "ok"
            with self._condition:
                self._failed += int(failed)
                self._completed += int(not failed)
                self._last = record
                self._active = False
                self._condition.notify_all()

    def snapshot(self):
        with self._condition:
            return {
                "state": "closed" if self._closed else "running" if self._active else "idle",
                "active": int(self._active), "waiting": self._waiting,
                "max_active": 1, "max_waiting": self.max_waiting,
                "wait_timeout_seconds": self.wait_timeout,
                "completed": self._completed, "failed": self._failed,
                "rejected": self._rejected, "last_execution": self._last,
                "sample_interval_seconds": self.sample_interval, "telemetry": self.telemetry_snapshot(),
            }

    def close(self):
        """Reject new work and drain current work before model references are released."""
        with self._condition:
            self._closed = True
            self._condition.notify_all()
            while self._active:
                self._condition.wait()
        self._sample_stop.set()
        if self._sample_thread is not None:
            self._sample_thread.join(timeout=3)
