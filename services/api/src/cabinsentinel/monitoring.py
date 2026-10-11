"""In-process request metrics and threshold alerts for the operations console."""

import threading
import time
from collections import deque
from datetime import UTC, datetime

WINDOW_S = 3600
BUCKET_S = 60
THRESHOLDS = {"p95_latency_ms": 1500.0, "error_rate": 0.05, "min_requests_for_rate": 20}


class Metrics:
    def __init__(self, clock=None):
        self.clock = clock or (lambda: datetime.now(UTC))
        self._lock = threading.Lock()
        self._events: deque[tuple[float, str, int, float]] = deque()
        self.started_at = self.clock()

    def record(self, path: str, status: int, duration_ms: float) -> None:
        now = time.time()
        with self._lock:
            self._events.append((now, path, status, duration_ms))
            while self._events and now - self._events[0][0] > WINDOW_S:
                self._events.popleft()

    def snapshot(self) -> dict:
        now = time.time()
        with self._lock:
            events = list(self._events)
        durations = sorted(e[3] for e in events)
        errors = sum(1 for e in events if e[2] >= 500)
        history: dict[int, list] = {}
        for ts, _, status, ms in events:
            history.setdefault(int((now - ts) // BUCKET_S), []).append((status, ms))
        series = []
        for age in sorted(history, reverse=True):
            group = sorted(ms for _, ms in history[age])
            series.append({"minutes_ago": age, "requests": len(group), "errors": sum(1 for s, _ in history[age] if s >= 500),
                           "p95_ms": round(group[min(len(group) - 1, int(len(group) * 0.95))], 2)})
        return {
            "window_seconds": WINDOW_S, "requests": len(events), "errors_5xx": errors,
            "error_rate": round(errors / len(events), 4) if events else 0.0,
            "p50_ms": round(durations[len(durations) // 2], 2) if durations else None,
            "p95_ms": round(durations[min(len(durations) - 1, int(len(durations) * 0.95))], 2) if durations else None,
            "uptime_seconds": int((self.clock() - self.started_at).total_seconds()),
            "latency_history": series,
        }

    def alerts(self, dependencies: dict[str, str]) -> list[dict]:
        snap, out = self.snapshot(), []
        for name, status in dependencies.items():
            if status in {"unavailable", "disconnected", "degraded"}:
                out.append({"severity": "critical", "code": f"DEPENDENCY_{name.upper()}", "message": f"{name} is {status}"})
        if snap["p95_ms"] is not None and snap["p95_ms"] > THRESHOLDS["p95_latency_ms"]:
            out.append({"severity": "warning", "code": "HIGH_LATENCY", "message": f"p95 latency {snap['p95_ms']} ms"})
        if snap["requests"] >= THRESHOLDS["min_requests_for_rate"] and snap["error_rate"] > THRESHOLDS["error_rate"]:
            out.append({"severity": "critical", "code": "HIGH_ERROR_RATE", "message": f"5xx rate {snap['error_rate']:.1%}"})
        return out


metrics = Metrics()
