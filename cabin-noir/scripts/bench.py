#!/usr/bin/env python3
"""Small load test: python3 scripts/bench.py http://127.0.0.1:8765 [threads] [seconds]
Needs a server in development mode (dev OTP echo). Creates a throwaway account and a vehicle, then hammers read endpoints."""
import json
import statistics
import sys
import threading
import time

base = sys.argv[1].rstrip("/")
threads = int(sys.argv[2]) if len(sys.argv) > 2 else 16
seconds = float(sys.argv[3]) if len(sys.argv) > 3 else 8


import http.client
from urllib.parse import urlparse

_u = urlparse(base)
_local = threading.local()


def call(method, path, body=None, token=None):
    """One keep-alive connection per thread, so the client does not exhaust sockets and measures the server, not connection setup."""
    c = getattr(_local, "c", None)
    if c is None:
        c = _local.c = http.client.HTTPConnection(_u.hostname, _u.port, timeout=20)
    headers = {"content-type": "application/json", **({"authorization": f"Bearer {token}"} if token else {})}
    try:
        c.request(method, path, json.dumps(body) if body is not None else None, headers)
        r = c.getresponse()
        data = r.read()
    except (http.client.HTTPException, OSError):
        _local.c = None
        raise
    if r.status >= 400:
        raise RuntimeError(f"{r.status} {data[:120]!r}")
    return json.loads(data or b"null")


phone = f"09{int(time.time()) % 100000000:08d}"
otp = call("POST", "/v1/auth/otp", {"phone": phone})
token = call("POST", "/v1/auth/verify", {"phone": phone, "code": otp["dev_code"], "name": "Bench"})["token"]
vid = call("POST", "/v1/vehicles", {"name": "Xe bench"}, token)["vehicle"]["id"]
paths = ["/health", "/v1/vehicles", f"/v1/vehicles/{vid}/status", f"/v1/vehicles/{vid}/history", "/v1/me"]
lat: dict[str, list[float]] = {p: [] for p in paths}
errors = 0
lock = threading.Lock()
stop = time.time() + seconds


def worker(i):
    global errors
    n = i
    while time.time() < stop:
        p = paths[n % len(paths)]
        n += 1
        t = time.perf_counter()
        try:
            call("GET", p, None, token)
            dt = (time.perf_counter() - t) * 1000
            with lock:
                lat[p].append(dt)
        except Exception:
            with lock:
                errors += 1


ts = [threading.Thread(target=worker, args=(i,)) for i in range(threads)]
t0 = time.time()
[t.start() for t in ts]
[t.join() for t in ts]
total = sum(len(v) for v in lat.values())
print(f"threads={threads} duration={time.time()-t0:.1f}s requests={total} rps={total/(time.time()-t0):.0f} errors={errors}")
for p, v in lat.items():
    if v:
        v.sort()
        print(f"{p.split(vid)[0] + ('{vid}' + p.split(vid)[1] if vid in p else ''):42s} p50={statistics.median(v):6.1f}ms p95={v[int(len(v)*0.95)-1]:6.1f}ms n={len(v)}")
