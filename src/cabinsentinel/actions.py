"""Demo action adapter. No vehicle, SMS, or unlock command is sent."""

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


class DemoActions(MockActions):
    """MockActions plus a per-demo-vehicle failure switch so delivery failure can be shown honestly.

    Nothing real is sent either way; a switched tool raises and the service records ``failed``.
    """

    def __init__(self):
        self.failing: dict[str, set[str]] = {}

    def set_failing(self, vehicle_id: str, tools: set[str]) -> None:
        if tools:
            self.failing[vehicle_id] = set(tools)
        else:
            self.failing.pop(vehicle_id, None)

    def execute(self, tool: str, vehicle_id: str) -> dict:
        if tool in self.failing.get(vehicle_id, ()):
            raise RuntimeError("simulated provider failure")
        return super().execute(tool, vehicle_id)
