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
