"""Local MQTT subscriber, with ordered background evaluation off the callback."""

import json
import logging
import queue
import threading
import time

import paho.mqtt.client as mqtt

from src.cabinsentinel.models import SensorPayload
from src.cabinsentinel.service import CabinService

logger = logging.getLogger(__name__)


class SensorSubscriber:
    def __init__(self, service: CabinService, *, host: str = "localhost", port: int = 1883):
        self.service = service
        self.host = host
        self.port = port
        self.queue: queue.Queue[SensorPayload | None] = queue.Queue(maxsize=256)
        self.client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2, client_id="cabinsentinel_backend")
        self.connected = False
        self.client.on_connect = self._on_connect
        self.client.on_disconnect = self._on_disconnect
        self.client.on_message = self._on_message
        self._worker: threading.Thread | None = None

    def _on_connect(self, client, userdata, flags, reason_code, properties):
        if not reason_code.is_failure:
            self.connected = True
            client.subscribe("cabinsentinel/+/sensors", qos=1)
        else:
            self.connected = False
            logger.error("MQTT connection failed: %s", reason_code)

    def _on_disconnect(self, client, userdata, disconnect_flags, reason_code, properties):
        self.connected = False

    def _on_message(self, client, userdata, message):
        self.accept_packet(message.topic, message.payload)

    def accept_packet(self, topic: str, payload: bytes) -> bool:
        try:
            if len(payload) > 4096:
                raise ValueError("MQTT payload too large")
            parts = topic.split("/")
            if len(parts) != 3 or parts[0] != "cabinsentinel" or parts[2] != "sensors":
                raise ValueError("Unexpected MQTT topic")
            data = json.loads(payload)
            sensor = SensorPayload.model_validate(data)
            if sensor.vehicle_id != parts[1]:
                raise ValueError("Topic vehicle and payload vehicle differ")
            self.queue.put_nowait(sensor)
            return True
        except (ValueError, json.JSONDecodeError, queue.Full) as exc:
            logger.warning("Rejected MQTT sensor packet: %s", exc)
            return False

    def process_queued(self) -> bool:
        try:
            item = self.queue.get_nowait()
        except queue.Empty:
            return False
        if item is None:
            return False
        try:
            self.service.ingest_sensor(item)
        except Exception:
            logger.exception("Failed to evaluate MQTT sensor packet")
        finally:
            self.queue.task_done()
        return True

    def _run(self):
        next_tick = time.monotonic() + 1
        while True:
            try:
                item = self.queue.get(timeout=max(0.1, next_tick - time.monotonic()))
            except queue.Empty:
                item = False
            if item is False:
                self.service.tick_all()
                next_tick = time.monotonic() + 1
                continue
            if item is None:
                self.queue.task_done()
                break
            try:
                self.service.ingest_sensor(item)
            except Exception:
                logger.exception("Failed to evaluate MQTT sensor packet")
            finally:
                self.queue.task_done()
            if time.monotonic() >= next_tick:
                self.service.tick_all()
                next_tick = time.monotonic() + 1

    def start(self):
        self._worker = threading.Thread(target=self._run, daemon=True)
        self._worker.start()
        self.client.connect_async(self.host, self.port, keepalive=60)
        self.client.loop_start()

    def stop(self):
        self.client.loop_stop()
        self.client.disconnect()
        self.connected = False
        if self._worker is not None:
            self.queue.put(None)
            self._worker.join(timeout=2)
