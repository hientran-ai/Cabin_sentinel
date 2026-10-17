"""Cabin Care: human-confirmed comfort measures while an occupant waits in a parked car (SIMULATED actions).

This module never decides or lowers a risk level (SR-04) and never closes an incident: it is a bridge until a person
returns (INT-01 treats climate control as a last-resort intervention, not as a resolution). What it adds:

* the owner says who is inside (child / adult / pet / unknown). Vision cannot tell age here, so the person decides;
  unknown is treated as a possible child (SR-03). Declaring "adult" changes the suggested comfort, never the alert;
* the owner can start/stop comfort remotely;
* if nobody reacts within ``CARE_AUTO_AFTER_S`` of the initial alert, and the owner pre-consented, comfort starts by
  itself as the documented last resort. Any acknowledgement, declaration or stop counts as a human response and disarms it;
* every step is an audited event (``care``) with actor, and actions go through the same SIMULATED adapter.
"""

from datetime import datetime

CARE_AUTO_AFTER_S = 90          # COMPLIANCE_BASELINE §5.2: still unhandled 90 s after the initial alert -> escalate
COMFORT_TARGET_C = 25.0         # design assumption (not measured, not clinical advice); OEM/medical review pending
MIN_BATTERY_PCT = 30            # same floor the pet-mode rule uses before trusting a climate-on-battery plan
PROFILES = ("CHILD", "ADULT", "PET", "UNKNOWN")
LULLABIES = ("twinkle", "brahms")
ADULT_AUDIO = ("ambient", "podcast_app", "music_app")
IDLE = {"status": "IDLE", "profile": "UNKNOWN", "incident_id": None, "auto_consent": True, "responded_at": None,
        "started_by": None, "started_at": None, "music": None, "ended_at": None, "ended_by": None, "end_reason": None, "plan": []}

SUGGESTIONS = {
    "ASK": "Ai đang ở trong xe? Chọn để hệ thống gợi ý cách chăm sóc phù hợp. Không chọn thì xem như có thể là trẻ em.",
    "CHILD": "Bật Chăm sóc trẻ: giữ mát vừa phải, nhạc ru nhẹ, màn hình thân thiện. Đây chỉ là biện pháp tạm; hãy quay lại xe ngay.",
    "ADULT": "Gợi ý Chế độ cắm trại: giữ nguồn và điều hoà, chọn nhạc hoặc ứng dụng. Cần người lớn tỉnh táo trong xe; cảnh báo vẫn theo dõi.",
    "PET": "Gợi ý Chế độ thú cưng: giữ điều hoà, nhắc không để trẻ em trong xe. Cảnh báo vẫn theo dõi.",
}


def _plan(profile: str, music: str | None, battery: float | None) -> list[dict]:
    climate_ok = battery is not None and battery > MIN_BATTERY_PCT
    climate = {"tool": "set_climate", "parameters": {"target_c": COMFORT_TARGET_C, "mode": "AUTO", "fan": "LOW"}}
    if not climate_ok:
        climate = {"tool": "set_climate", "skipped": "BATTERY_UNKNOWN_OR_LOW", "parameters": {"battery_pct": battery}}
    if profile == "ADULT":
        return [climate, {"tool": "set_operation_mode", "parameters": {"mode": "CAMP"}},
                {"tool": "play_comfort_audio", "parameters": {"source": music or "ambient", "volume_pct": 25}}]
    if profile == "PET":
        return [climate, {"tool": "set_operation_mode", "parameters": {"mode": "PET"}},
                {"tool": "show_cabin_screen", "parameters": {"screen": "PET_NOTICE", "message": "no_children"}}]
    return [climate, {"tool": "play_comfort_audio", "parameters": {"source": music if music in LULLABIES else "twinkle", "volume_pct": 20}},
            {"tool": "show_cabin_screen", "parameters": {"screen": "CHILD_FRIENDLY", "message": "owner_notified"}}]


def current(service, vehicle_id: str) -> dict:
    rows = service.events(vehicle_id, event_type="care", limit=1)
    return {**IDLE, **(rows[0]["care"] if rows else {})}


def _save(service, vehicle_id: str, care: dict, change: str, actor: dict) -> dict:
    service.record_event(vehicle_id, "care", {"at": service.clock().isoformat(), "change": change, "actor": actor, "care": care})
    return care


def _open_incident(state: dict | None) -> dict | None:
    incident = (state or {}).get("incident")
    return incident if incident and incident.get("status") == "OPEN" else None


def _for_incident(care: dict, incident: dict | None) -> dict:
    """Care belongs to one incident; a new incident starts from a clean slate (consent is kept)."""
    if incident and care["incident_id"] != incident["incident_id"]:
        return {**IDLE, "auto_consent": care["auto_consent"], "incident_id": incident["incident_id"]}
    return care


def _responded(care: dict, incident: dict | None) -> bool:
    return bool(incident and (incident.get("acknowledged_at") or care["responded_at"]))


def _countdown(service, state: dict | None, care: dict, incident: dict | None) -> dict:
    armed = bool(incident and care["status"] == "IDLE" and care["auto_consent"] and state and state.get("decision_current")
                 and not _responded(care, incident))
    started = ((state or {}).get("alert") or {}).get("initial_sent_at")
    started = started or (incident or {}).get("opened_at")
    if not armed or not started:
        return {"armed": False, "remaining_s": None, "after_s": CARE_AUTO_AFTER_S}
    elapsed = (service.clock() - datetime.fromisoformat(started)).total_seconds()
    return {"armed": True, "remaining_s": max(0, round(CARE_AUTO_AFTER_S - elapsed)), "after_s": CARE_AUTO_AFTER_S}


def view(service, vehicle_id: str, state: dict | None) -> dict:
    incident = _open_incident(state)
    care = _for_incident(current(service, vehicle_id), incident)
    living = bool(state and state.get("occupancy_state") in {"PRESENT", "SUSPECTED"})
    suggestion = None
    if incident and care["status"] != "ACTIVE":
        suggestion = {"kind": "ASK" if care["profile"] == "UNKNOWN" and not care["responded_at"] else care["profile"]}
        suggestion["text"] = SUGGESTIONS["CHILD" if suggestion["kind"] == "UNKNOWN" else suggestion["kind"]]
    return {
        **care, "simulated": True, "can_start": bool(incident), "occupancy_evidence": living,
        "countdown": _countdown(service, state, care, incident), "suggestion": suggestion,
        "never_resolves_incident": True, "target_c": COMFORT_TARGET_C,
        "notes": ["Chăm sóc chỉ là biện pháp tạm: rủi ro và sự cố vẫn do luật và người xác nhận quyết định.",
                  "Mô phỏng: chưa có kết nối điều hoà, loa hay màn hình xe thật (OEM_NOT_VERIFIED)."],
    }


def _execute(service, vehicle_id: str, plan: list[dict]) -> list[dict]:
    results = []
    for step in plan:
        if step.get("skipped"):
            results.append({**step, "status": "SKIPPED"})
            continue
        try:
            results.append({**step, **service.actions.execute(step["tool"], vehicle_id)})
        except Exception as exc:  # noqa: BLE001 - the adapter failure is data, not a reason to stop the other steps
            results.append({**step, "status": "failed", "error": type(exc).__name__})
    return results


def _battery(state: dict | None) -> float | None:
    snapshot = (state or {}).get("sensor_snapshot") or {}
    value = snapshot.get("battery_soc_pct")
    return float(value) if value is not None else None


def start(service, vehicle_id: str, state: dict | None, *, profile: str | None, music: str | None, actor: dict) -> dict:
    incident = _open_incident(state)
    if not incident:
        raise ValueError("Cabin Care needs an open incident")
    care = _for_incident(current(service, vehicle_id), incident)
    if care["status"] == "ACTIVE":
        raise ValueError("Cabin Care is already active")
    chosen = profile or care["profile"]
    if chosen not in PROFILES:
        raise ValueError("Unknown occupant profile")
    if music is not None and music not in (*LULLABIES, *ADULT_AUDIO):
        raise ValueError("Unknown audio choice")
    plan = _plan(chosen, music, _battery(state))
    care = {**care, "status": "ACTIVE", "profile": chosen, "incident_id": incident["incident_id"], "music": music,
            "started_by": actor["kind"], "started_at": service.clock().isoformat(), "responded_at": care["responded_at"] or (
                service.clock().isoformat() if actor["kind"] != "AUTO_TIMEOUT" else None),
            "plan": _execute(service, vehicle_id, plan), "ended_at": None, "ended_by": None, "end_reason": None}
    return _save(service, vehicle_id, care, "START", actor)


def stop(service, vehicle_id: str, state: dict | None, *, actor: dict, reason: str = "OWNER_STOPPED") -> dict:
    care = _for_incident(current(service, vehicle_id), _open_incident(state))
    if care["status"] != "ACTIVE":
        raise ValueError("Cabin Care is not active")
    care = {**care, "status": "ENDED", "ended_at": service.clock().isoformat(), "ended_by": actor["kind"], "end_reason": reason,
            "responded_at": care["responded_at"] or service.clock().isoformat(), "plan": []}
    return _save(service, vehicle_id, care, "STOP", actor)


def declare(service, vehicle_id: str, state: dict | None, *, occupant: str, actor: dict) -> dict:
    incident = _open_incident(state)
    if not incident:
        raise ValueError("Declaring the occupant needs an open incident")
    if occupant not in PROFILES:
        raise ValueError("Unknown occupant profile")
    care = _for_incident(current(service, vehicle_id), incident)
    care = {**care, "profile": occupant, "incident_id": incident["incident_id"], "responded_at": service.clock().isoformat()}
    return _save(service, vehicle_id, care, "DECLARE", actor)


def set_consent(service, vehicle_id: str, state: dict | None, *, auto_start: bool, actor: dict) -> dict:
    care = _for_incident(current(service, vehicle_id), _open_incident(state))
    care = {**care, "auto_consent": auto_start}
    return _save(service, vehicle_id, care, "CONSENT", actor)


def tick(service, vehicle_id: str, state: dict | None) -> None:
    """Lazy deterministic transitions: end with the incident, or start the documented last-resort comfort."""
    incident = _open_incident(state)
    care = current(service, vehicle_id)
    system = {"kind": "SYSTEM", "authentication": "NONE"}
    if care["status"] == "ACTIVE" and (incident is None or incident["incident_id"] != care["incident_id"]):
        _save(service, vehicle_id, {**care, "status": "ENDED", "ended_at": service.clock().isoformat(), "ended_by": "SYSTEM",
                                    "end_reason": "INCIDENT_CLOSED", "plan": []}, "END", system)
        return
    if not incident:
        return
    care = _for_incident(care, incident)
    countdown = _countdown(service, state, care, incident)
    if countdown["armed"] and countdown["remaining_s"] == 0:
        start(service, vehicle_id, state, profile=None, music=None, actor={"kind": "AUTO_TIMEOUT", "authentication": "PRE_CONSENT"})

