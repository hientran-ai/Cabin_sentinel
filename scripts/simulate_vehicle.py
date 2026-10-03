#!/usr/bin/env python3
"""Deterministic multi-vehicle simulator for the CabinSentinel demo fleet.

Publishes SIMULATED sensor snapshots (HTTP or MQTT) and SIMULATED camera
detections (HTTP) through the authenticated device ingest API. The backend's
deterministic rules decide every risk level; this script only supplies inputs.

  python scripts/simulate_vehicle.py                       # default demo fleet
  python scripts/simulate_vehicle.py --scenario VF9-DEMO-02=RAMP
  python scripts/simulate_vehicle.py --once --scenario VF8-DEMO-01=SAFE

Scenarios (temperatures are inputs; thresholds live in src/cabinsentinel/rules.py):
  SAFE      engine off, 24 °C, no occupant, radar clear      -> SAFE / EMPTY_CABIN
  WARNING   engine off, 28 °C, person detected, radar on     -> WARNING / COOL_OCCUPANT
  CRITICAL  engine off, 39.2 °C, person detected, doors locked -> CRITICAL / HOT_OCCUPANT
  RAMP      WARNING inputs, +0.5 °C per tick up to 41 °C     -> WARNING then CRITICAL
  OFFLINE   publishes nothing                                 -> no data / stale -> UNKNOWN
"""

import argparse
import json
import os
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_FLEET = {"VF8-DEMO-01": "CRITICAL", "VF9-DEMO-02": "WARNING", "VF5-DEMO-03": "SAFE", "VF3-DEMO-04": "OFFLINE"}
PERSON = [{"class_name": "person", "confidence": 0.91}]
SCENARIOS = {
    "SAFE": {"temperature": 24.0, "radar_presence": False, "objects": []},
    "WARNING": {"temperature": 28.0, "radar_presence": True, "objects": PERSON},
    "CRITICAL": {"temperature": 39.2, "radar_presence": True, "objects": PERSON},
    "RAMP": {"temperature": 28.0, "radar_presence": True, "objects": PERSON, "ramp": 0.5, "max": 41.0},
    "OFFLINE": None,
}


def device_token() -> str:
    token = os.environ.get("CABINSENTINEL_DEVICE_TOKEN")
    if not token:
        file = ROOT / "data" / ".device-token"
        token = file.read_text().strip() if file.is_file() else ""
    if not token:
        sys.exit("No device token: export CABINSENTINEL_DEVICE_TOKEN or start ./scripts/run_backend.sh first")
    return token


def snapshot(vehicle_id: str, scenario: str, tick: int, sequence: int, now: datetime) -> tuple[dict, dict]:
    spec = SCENARIOS[scenario]
    temperature = spec["temperature"]
    if spec.get("ramp"):
        temperature = min(spec["max"], temperature + spec["ramp"] * tick)
    sensor = {
        "vehicle_id": vehicle_id, "timestamp": now.isoformat(), "sequence": sequence,
        "temperature": round(temperature, 1), "engine_status": "OFF", "doors_locked": True,
        "radar_presence": spec["radar_presence"], "driver_present": False, "gear": "P",
        "vehicle_speed_kph": 0.0, "hvac_status": "INACTIVE", "window_status": "CLOSED",
        "powertrain_type": "EV", "operation_mode": "NONE",
    }
    vision = {
        "vehicle_id": vehicle_id, "timestamp": now.isoformat(), "frame_id": f"sim-{RUN_ID}:{sequence}",
        "camera_status": "OK", "detected_objects": spec["objects"],
    }
    return sensor, vision


RUN_ID = uuid4().hex[:8]


def publish(client, mqtt, vehicle, scenario, tick, sequence, now):
    sensor, vision = snapshot(vehicle, scenario, tick, sequence, now)
    if mqtt is not None:
        mqtt.publish(f"cabinsentinel/{vehicle}/sensors", json.dumps(sensor), qos=1)
        sensor_result = "mqtt"
    else:
        response = client.post(f"/api/v1/vehicles/{vehicle}/sensors", json=sensor)
        sensor_result = response.json().get("result") if response.is_success else f"HTTP {response.status_code}"
    response = client.post(f"/api/v1/vehicles/{vehicle}/vision", json=vision)
    body = response.json() if response.headers.get("content-type", "").startswith("application/json") else {}
    if not response.is_success:
        print(f"  {vehicle}: vision HTTP {response.status_code} {body.get('detail', '')}", file=sys.stderr)
        return
    print(f"  t={tick:<4} {vehicle:<12} {scenario:<8} {sensor['temperature']:>5}°C sensor={sensor_result:<18} "
          f"risk={body.get('risk_level')} rev={body.get('revision')}")




def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default=os.environ.get("CABINSENTINEL_API_URL", "http://127.0.0.1:7863"))
    parser.add_argument("--scenario", action="append", default=[], metavar="VEHICLE=SCENARIO")
    parser.add_argument("--only", action="store_true", help="publish only vehicles given with --scenario")
    parser.add_argument("--interval", type=float, default=1.0, help="seconds between ticks (sensor TTL is 5 s, vision 3 s)")
    parser.add_argument("--ticks", type=int, default=0, help="stop after N ticks (0 = run until Ctrl-C)")
    parser.add_argument("--once", action="store_true", help="publish one tick and exit")
    parser.add_argument("--transport", choices=["http", "mqtt"], default="http", help="sensor transport; vision always uses HTTP")
    parser.add_argument("--mqtt-host", default=os.environ.get("MQTT_BROKER_HOST", "localhost"))
    parser.add_argument("--mqtt-port", type=int, default=int(os.environ.get("MQTT_BROKER_PORT", "1883")))
    args = parser.parse_args()

    fleet = {} if args.only else dict(DEFAULT_FLEET)
    for item in args.scenario:
        vehicle, _, scenario = item.partition("=")
        if scenario.upper() not in SCENARIOS:
            parser.error(f"unknown scenario {scenario!r}; choose from {', '.join(SCENARIOS)}")
        fleet[vehicle] = scenario.upper()
    headers = {"Authorization": f"Bearer {device_token()}"}
    mqtt = None
    if args.transport == "mqtt":
        import paho.mqtt.client as paho

        mqtt = paho.Client(paho.CallbackAPIVersion.VERSION2, client_id=f"cabinsentinel-sim-{RUN_ID}")
        mqtt.connect(args.mqtt_host, args.mqtt_port)
        mqtt.loop_start()

    ticks = 1 if args.once else args.ticks
    base = int(time.time() * 1000)  # keeps sequences increasing across simulator restarts
    print(f"simulator {RUN_ID} -> {args.base_url} ({args.transport}); fleet: {json.dumps(fleet)}")
    tick = 0
    with httpx.Client(base_url=args.base_url, headers=headers, timeout=10) as client:
        try:
            while not ticks or tick < ticks:
                now = datetime.now(UTC)
                for vehicle, scenario in fleet.items():
                    if SCENARIOS[scenario] is None:
                        continue
                    try:
                        publish(client, mqtt, vehicle, scenario, tick, base + tick, now)
                    except httpx.HTTPError as exc:
                        # Keep running across backend restarts; vehicles go UNKNOWN meanwhile.
                        print(f"  t={tick:<4} {vehicle:<12} backend unreachable ({type(exc).__name__}); retrying next tick", file=sys.stderr)
                tick += 1
                if not ticks or tick < ticks:
                    time.sleep(args.interval)
        except KeyboardInterrupt:
            print("stopped; vehicles go stale (UNKNOWN) after the sensor/vision TTL")
        finally:
            if mqtt is not None:
                mqtt.loop_stop()
                mqtt.disconnect()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
