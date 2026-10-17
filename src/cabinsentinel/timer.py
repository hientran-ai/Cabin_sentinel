"""One offline periodic evaluator owned by the API lifecycle."""

import logging
import threading
import time
from datetime import UTC, datetime, timedelta

logger = logging.getLogger(__name__)


class SafetyTimer:
    def __init__(self, service, *, interval=1.0, retention: timedelta | None = None, purge_every_s=600.0):
        self.service = service
        self.interval = interval
        self.retention = retention
        self.purge_every_s = purge_every_s
        self._last_purge = time.monotonic()
        self._stop = threading.Event()
        self._thread = None
        self.last_tick_at = None
        self.last_error = None

    @property
    def running(self):
        return self._thread is not None and self._thread.is_alive()

    def evaluate(self):
        try:
            self.service.tick_all()
            if self.retention is not None and time.monotonic() - self._last_purge >= self.purge_every_s:
                self._last_purge = time.monotonic()
                purged = self.service.purge_expired_demo(self.retention)
                if purged:
                    logger.info("Purged %d expired demo sessions", purged)
            self.last_error = None
            self.last_tick_at = datetime.now(UTC).isoformat()
        except Exception as exc:
            self.last_error = type(exc).__name__
            logger.exception("Safety timer evaluation failed")

    def _run(self):
        while not self._stop.wait(self.interval):
            self.evaluate()

    def start(self):
        if self.running:
            raise RuntimeError("Safety timer already running")
        self._stop.clear()
        self.evaluate()
        self._thread = threading.Thread(target=self._run, daemon=True, name="cabinsentinel-safety-timer")
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
            if self.running:
                raise TimeoutError("Safety timer has not stopped")
