"""Action adapter. The horn, SMS and unlock are never sent to a vehicle from here.

``MockActions`` records what would happen. ``ChannelActions`` additionally delivers the owner notification (and the
escalation text) through the configured ntfy/Telegram channel, so the alert reaches a real phone; the SMS gateway
itself is still not wired, and the result says so.
"""

from src.cabinsentinel import notify

# Fixed demo parameters so the UI can show what each simulated action would do.
ACTION_PARAMETERS = {
    "trigger_horn": {"pattern": "PULSE", "duration_s": 30, "hazard_lights": True},
    "send_sms": {"recipient": "EMERGENCY_CONTACT", "channel": "SMS"},
    "send_notification": {"recipient": "OWNER", "channel": "APP_PUSH"},
}


class MockActions:
    def execute(self, tool: str, vehicle_id: str) -> dict:
        result = {"tool": tool, "vehicle_id": vehicle_id, "status": "simulated"}
        if tool in ACTION_PARAMETERS:
            result["parameters"] = dict(ACTION_PARAMETERS[tool])
        return result


class ChannelActions(MockActions):
    """Mock actions plus a real message on ntfy/Telegram for the two notification tools."""

    MESSAGES = {
        "send_notification": ("CabinSentinel: có người trong xe", "Xe {vehicle}: phát hiện người trong cabin khi xe đã tắt máy. Hãy kiểm tra ngay."),
        "send_sms": ("CabinSentinel: LEO THANG", "Xe {vehicle}: cảnh báo chưa được xử lý. Liên hệ người có mặt gần xe hoặc gọi 112."),
    }

    def execute(self, tool: str, vehicle_id: str) -> dict:
        result = super().execute(tool, vehicle_id)
        if tool in self.MESSAGES:
            title, body = self.MESSAGES[tool]
            queued = notify.deliver_async(title, body.format(vehicle=vehicle_id), urgent=True,
                                          card_for=lambda: card_for(vehicle_id))
            if tool == "send_notification" and queued:
                result["status"] = "dispatched"
                result["parameters"] = {**result["parameters"], "channels": [c for c, on in notify.channels().items() if on]}
            elif queued:
                result["note"] = "SMS gateway chưa nối; nội dung đã chuyển tiếp qua kênh thông báo"
        return result


def card_for(vehicle_id: str) -> bytes:
    """The alert card for the current state of this vehicle, with the camera simulator's seats when it is running."""
    from src.cabinsentinel import alert_card, demo_studio
    from src.cabinsentinel.api import get_cabin_service

    state = get_cabin_service().get_state_with_freshness(vehicle_id) or {}
    studio = demo_studio.get_studio()
    run = studio.video.get(vehicle_id) if studio is not None else None
    seats = run.last_seats if run is not None else None
    return alert_card.render(vehicle_id, state, seats, label="SIMULATED" if run is not None else None)


def build_actions() -> MockActions:
    return ChannelActions() if notify.configured() else MockActions()
