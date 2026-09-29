#!/usr/bin/env python3
"""Publish repeatable CabinSentinel sensor snapshots to local Mosquitto."""

import argparse
import json
import time
from datetime import UTC, datetime

import paho.mqtt.client as mqtt


def build_payload(
    *, vehicle_id: str, timestamp: datetime, sequence: int,
    temperature: float, engine_status: str, doors_locked: bool,
    radar_presence: bool, powertrain_type: str = "UNKNOWN",
    operation_mode: str = "UNKNOWN", hvac_status: str = "UNKNOWN",
    battery_soc_pct: float | None = None,
    remote_start_expires_at: datetime | None = None,
    driver_present: bool | None = None, gear: str = "UNKNOWN",
    vehicle_speed_kph: float | None = None,
) -> dict:
    return {
        "schema_version": 1,
        "vehicle_id": vehicle_id,
        "timestamp": timestamp.isoformat(),
        "sequence": sequence,
        "temperature": temperature,
        "engine_status": engine_status,
        "doors_locked": doors_locked,
        "radar_presence": radar_presence,
        "powertrain_type": powertrain_type,
        "operation_mode": operation_mode,
        "hvac_status": hvac_status,
        "battery_soc_pct": battery_soc_pct,
        "remote_start_expires_at": (
            remote_start_expires_at.isoformat() if remote_start_expires_at else None
        ),
        "driver_present": driver_present,
        "gear": gear,
        "vehicle_speed_kph": vehicle_speed_kph,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="CabinSentinel MQTT sensor simulator")
    parser.add_argument("--vehicle-id", default="CAR_1")
    parser.add_argument("--host", default="localhost")
    parser.add_argument("--port", type=int, default=1883)
    parser.add_argument("--temperature", type=float, default=30.0)
    parser.add_argument("--engine", choices=("ON", "OFF", "UNKNOWN"), default="OFF")
    parser.add_argument("--radar", action="store_true")
    parser.add_argument("--doors-unlocked", action="store_true")
    parser.add_argument("--powertrain", choices=("EV", "ICE", "UNKNOWN"), default="UNKNOWN")
    parser.add_argument("--mode", choices=("NONE", "PET", "CAMP", "REMOTE_START", "UNKNOWN"), default="UNKNOWN")
    parser.add_argument("--hvac", choices=("ACTIVE", "INACTIVE", "FAULT", "UNKNOWN"), default="UNKNOWN")
    parser.add_argument("--soc", type=float)
    parser.add_argument("--remote-start-expires-at", type=datetime.fromisoformat)
    parser.add_argument("--driver-present", action="store_true", default=None)
    parser.add_argument("--gear", choices=("P", "R", "N", "D", "UNKNOWN"), default="UNKNOWN")
    parser.add_argument("--speed", type=float)
    parser.add_argument("--interval", type=float, default=1.0)
    parser.add_argument("--once", action="store_true")
    args = parser.parse_args()

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.connect(args.host, args.port, keepalive=60)
    client.loop_start()
    sequence = 0
    try:
        while True:
            sequence += 1
            payload = build_payload(
                vehicle_id=args.vehicle_id,
                timestamp=datetime.now(UTC),
                sequence=sequence,
                temperature=args.temperature,
                engine_status=args.engine,
                doors_locked=not args.doors_unlocked,
                radar_presence=args.radar,
                powertrain_type=args.powertrain,
                operation_mode=args.mode,
                hvac_status=args.hvac,
                battery_soc_pct=args.soc,
                remote_start_expires_at=args.remote_start_expires_at,
                driver_present=args.driver_present,
                gear=args.gear,
                vehicle_speed_kph=args.speed,
            )
            topic = f"cabinsentinel/{args.vehicle_id}/sensors"
            info = client.publish(topic, json.dumps(payload), qos=1, retain=False)
            info.wait_for_publish(timeout=5)
            print(f"{topic}: {json.dumps(payload)}")
            if args.once:
                break
            time.sleep(args.interval)
    finally:
        client.loop_stop()
        client.disconnect()


if __name__ == "__main__":
    main()
