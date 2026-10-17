"""Bounded frame DAG: independent model instances, joined before state updates."""
from concurrent.futures import ThreadPoolExecutor
from time import perf_counter


class FrameBranches:
    def __init__(self, enabled=True):
        self.pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='vision') if enabled else None

    @staticmethod
    def _run(function):
        start = perf_counter()
        try:
            return dict(value=function(), latency_ms=(perf_counter()-start)*1000, error=None)
        except Exception as exc:
            return dict(value=None, latency_ms=(perf_counter()-start)*1000, error=exc)

    def run(self, branches):
        # Join EVERY submitted branch, including after a failure. No model from
        # this frame can still be running when the next request acquires the lock.
        if self.pool is None:
            return {name: self._run(fn) for name, fn in branches.items()}
        pending = {name: self.pool.submit(self._run, fn) for name, fn in branches.items()}
        return {name: future.result() for name, future in pending.items()}

    def close(self):
        if self.pool is not None:
            self.pool.shutdown(wait=True, cancel_futures=True)
