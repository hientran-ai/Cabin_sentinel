"""Validated contracts exchanged by the sensor and vision modules."""

import hashlib
import json
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class SensorPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    schema_version: Literal[1] = 1
    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    timestamp: datetime
    sequence: int = Field(ge=0)
    temperature: float = Field(ge=-40, le=85, allow_inf_nan=False)
    engine_status: Literal["ON", "OFF", "UNKNOWN"]
    doors_locked: bool
    radar_presence: bool
    locked_at: datetime | None = None
    lock_event_id: str | None = Field(default=None, min_length=1, max_length=128)
    lock_event_source: Literal["SIMULATED", "VEHICLE_TELEMETRY"] | None = None
    powertrain_type: Literal["EV", "ICE", "UNKNOWN"] = "UNKNOWN"
    operation_mode: Literal["NONE", "PET", "CAMP", "REMOTE_START", "UNKNOWN"] = "UNKNOWN"
    hvac_status: Literal["ACTIVE", "INACTIVE", "FAULT", "UNKNOWN"] = "UNKNOWN"
    battery_soc_pct: float | None = Field(default=None, ge=0, le=100)
    remote_start_expires_at: datetime | None = None
    driver_present: bool | None = None
    gear: Literal["P", "R", "N", "D", "UNKNOWN"] = "UNKNOWN"
    vehicle_speed_kph: float | None = Field(default=None, ge=0)
    window_status: Literal["CLOSED", "VENTED", "OPEN", "UNKNOWN"] = "UNKNOWN"

    @field_validator("timestamp", "remote_start_expires_at", "locked_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        return value


    @model_validator(mode="after")
    def coherent_lock_event(self):
        fields = (self.locked_at, self.lock_event_id, self.lock_event_source)
        if any(v is not None for v in fields):
            if not all(v is not None for v in fields) or not self.doors_locked:
                raise ValueError("Lock event requires locked_at, id, source and locked doors")
            if self.locked_at > self.timestamp:
                raise ValueError("Lock event cannot follow the sensor observation")
        return self


class DetectedObject(BaseModel):
    model_config = ConfigDict(extra="ignore")

    detection_id: str | None = Field(default=None, min_length=1, max_length=128)
    class_name: str
    confidence: float = Field(ge=0, le=1, allow_inf_nan=False)

    @model_validator(mode="before")
    @classmethod
    def normalize_name(cls, data):
        if isinstance(data, dict) and "class_name" not in data and "class" in data:
            return {**data, "class_name": data["class"]}
        return data


class SeatEvidence(BaseModel):
    model_config = ConfigDict(extra="forbid")

    evidence_id: str = Field(min_length=1, max_length=128)
    child_seat_present: bool | None
    seat_orientation: Literal["REAR_FACING", "FORWARD_FACING", "UNKNOWN"]
    orientation_confidence: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    seat_position: str | None = None
    observed_at: datetime
    source: str = Field(min_length=1, max_length=128)
    model_version: str | None = None
    quality: Literal["OK", "DEGRADED", "UNKNOWN"]
    seat_detection_id: str | None = None
    related_occupant_detection_id: str | None = None

    @field_validator("observed_at")
    @classmethod
    def require_observation_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("observed_at must include timezone")
        return value


class VisionPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    vehicle_id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,64}$")
    timestamp: datetime
    frame_id: str = Field(min_length=1, max_length=128)
    camera_status: Literal["OK", "BLOCKED", "ERROR", "DISCONNECTED", "NO_FEED"]
    detected_objects: list[DetectedObject]
    seat_evidence: list[SeatEvidence] = Field(default_factory=list)
    vision_latency_ms: float | None = Field(default=None, ge=0)

    @model_validator(mode="before")
    @classmethod
    def derive_frame_id(cls, data):
        if isinstance(data, dict):
            data = data.copy()
            if "objects" in data:
                data.setdefault("detected_objects", data.pop("objects"))
            if not data.get("frame_id"):
                fingerprint = hashlib.sha256(
                    json.dumps(data, sort_keys=True, default=str).encode("utf-8")
                ).hexdigest()[:20]
                data["frame_id"] = f"auto-{fingerprint}"
        return data

    @field_validator("timestamp")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None:
            raise ValueError("timestamp must include timezone")
        return value
