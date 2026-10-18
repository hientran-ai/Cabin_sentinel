"""Offline incident/notification lifecycle, independent from thermal risk rules."""

from copy import deepcopy
from datetime import datetime, timedelta
from uuid import uuid4

INITIAL_CUE_SECONDS = 3
ESCALATION_SECONDS = 90
REPEAT_SECONDS = 60
MIN_REPEAT_SECONDS = 20 * 60
DISPATCH_MARGIN_SECONDS = 1


def data_quality(sensor, vision, now):
    issues = []
    for name, payload, ttl in [("sensor", sensor, 5), ("vision", vision, 3)]:
        if payload is None:
            issues.append(f"{name.upper()}_MISSING")
        elif not -2 <= (now - datetime.fromisoformat(payload["timestamp"])).total_seconds() <= ttl:
            issues.append(f"{name.upper()}_STALE")
    if vision and vision["camera_status"] != "OK":
        issues.append("CAMERA_UNAVAILABLE")
    return {
        "status": "STALE" if any(i.endswith("STALE") for i in issues) else "UNKNOWN" if issues else "CURRENT",
        "issues": issues,
    }


def evolve_incident(old_state, decision, sensor, vision, now):
    """Return durable deltas and due tools; caller commits them before effects."""
    old = old_state or {}
    incident = deepcopy(old.get("incident"))
    alert = deepcopy(old.get("alert"))
    previous = old.get("risk_level")
    # Import legacy active decisions without inventing a reliable lock timestamp.
    if (
        incident is None
        and "incident" not in old
        and old.get("incident_id")
        and previous in {"WARNING", "CRITICAL"}
        and old.get("occupancy_state") in {"PRESENT", "SUSPECTED"}
        and old.get("rule_id") != "HOT_ATTENDED_DRIVING"
    ):
        incident = {
            "incident_id": old["incident_id"],
            "status": "OPEN",
            "opened_at": old["evaluated_at"],
            "acknowledged_at": None,
            "resolved_at": None,
            "migration": "LEGACY_TIMING_UNKNOWN",
        }
    attended = (
        sensor
        and sensor.get("driver_present") is True
        and sensor.get("gear") in {"D", "R"}
        and (sensor.get("vehicle_speed_kph") or 0) > 0
    )
    unattended = (
        not attended
        and decision["occupancy_state"] in {"PRESENT", "SUSPECTED"}
        and decision["risk_level"] in {"WARNING", "CRITICAL"}
    )
    opened = False
    if unattended and (incident is None or incident["status"] == "RESOLVED"):
        incident = {
            "incident_id": str(uuid4()),
            "status": "OPEN",
            "opened_at": now.isoformat(),
            "acknowledged_at": None,
            "resolved_at": None,
        }
        alert = None
        opened = True
    active = incident is not None and incident["status"] == "OPEN"
    due_tools = []
    event = None
    if active:
        if alert is None:
            ends = now + timedelta(seconds=INITIAL_CUE_SECONDS)
            alert = {
                "stage": "INITIAL",
                "initial_sent_at": now.isoformat(),
                "initial_ends_at": ends.isoformat(),
                "escalation_due_at": (
                    ends + timedelta(seconds=ESCALATION_SECONDS - DISPATCH_MARGIN_SECONDS)
                ).isoformat(),
                "escalation_deadline_at": (ends + timedelta(seconds=ESCALATION_SECONDS)).isoformat(),
                "profile_version": 2,
                "escalated_at": None,
                "next_repeat_at": (now + timedelta(seconds=REPEAT_SECONDS)).isoformat(),
                "minimum_repeat_until": (now + timedelta(seconds=MIN_REPEAT_SECONDS)).isoformat(),
                "last_sent_at": now.isoformat(),
                "repeat_count": 0,
                "sequence": 1,
                "delivery_mode": "SIMULATED",
                "lock_timing": {"status": "UNKNOWN", "source": None, "latency_s": None},
            }
            alert["temporal_origin"] = incident.get("migration", "CURRENT_PROFILE")
            if incident.get("migration"):
                due_tools.append("send_notification")
            event = "INITIAL"
        else:
            if "escalation_deadline_at" not in alert:
                alert["escalation_deadline_at"] = alert["escalation_due_at"]
                alert["escalation_due_at"] = (
                    datetime.fromisoformat(alert["escalation_deadline_at"]) - timedelta(seconds=DISPATCH_MARGIN_SECONDS)
                ).isoformat()
                alert["profile_version"] = 2
            prior_now = datetime.fromisoformat(old.get("evaluated_at", incident["opened_at"]))
            if now < prior_now:
                alert["temporal_status"] = "UNKNOWN_CLOCK_REGRESSION"
            elif alert.get("temporal_status") != "UNKNOWN_CLOCK_REGRESSION":
                if alert["escalated_at"] is None and now >= datetime.fromisoformat(alert["escalation_due_at"]):
                    latency = (now - datetime.fromisoformat(alert["initial_ends_at"])).total_seconds()
                    alert.update(
                        stage="ESCALATED",
                        escalated_at=now.isoformat(),
                        escalation_latency_s=latency,
                        escalation_target_met=latency <= ESCALATION_SECONDS,
                    )
                    due_tools.append("send_sms")
                    event = "ESCALATED"
                repeat_deadline = datetime.fromisoformat(alert["next_repeat_at"])
                if now >= repeat_deadline - timedelta(seconds=DISPATCH_MARGIN_SECONDS):
                    due_tools.append("send_notification")
                    alert["repeat_count"] += 1
                    # Resume one notification; do not burst-replay missed windows.
                    alert["repeat_target_met"] = now <= repeat_deadline
                    alert["repeat_lateness_s"] = max(0.0, (now - repeat_deadline).total_seconds())
                    base = repeat_deadline if now <= repeat_deadline else now
                    alert["next_repeat_at"] = (base + timedelta(seconds=REPEAT_SECONDS)).isoformat()
                    event = event or "REPEAT"
                if event:
                    alert["last_sent_at"] = now.isoformat()
                    alert["sequence"] += 1
        if sensor and sensor.get("locked_at") and sensor["doors_locked"]:
            lock_at = datetime.fromisoformat(sensor["locked_at"])
            prior_timing = alert["lock_timing"]
            if prior_timing.get("event_id") != sensor["lock_event_id"]:
                initial_at = datetime.fromisoformat(alert["initial_sent_at"])
                # A warning issued before a new locking event cannot prove that
                # an after-lock warning was delivered. Reissue without deferring
                # this incident's escalation/repeat deadlines.
                sent_at = initial_at if lock_at <= initial_at else now
                if lock_at > initial_at:
                    due_tools.append("send_notification")
                    alert["last_sent_at"] = now.isoformat()
                    alert["sequence"] += 1
                    event = event or "LOCK_WARNING"
                latency = (sent_at - lock_at).total_seconds() if lock_at <= now else None
                alert["lock_timing"] = {
                    "status": "UNKNOWN_CLOCK_SKEW"
                    if latency is None
                    else "WITHIN_TARGET"
                    if latency <= 15
                    else "TARGET_MISSED",
                    "source": sensor.get("lock_event_source"),
                    "event_id": sensor.get("lock_event_id"),
                    "locked_at": sensor["locked_at"],
                    "warning_sent_at": sent_at.isoformat(),
                    "latency_s": latency,
                    "target_s": 15,
                }
    return incident, alert, due_tools, event, opened
