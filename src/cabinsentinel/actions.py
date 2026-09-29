"""Demo action adapter. No vehicle, SMS, or unlock command is sent."""


class MockActions:
    def execute(self, tool: str, vehicle_id: str) -> dict:
        return {"tool": tool, "vehicle_id": vehicle_id, "status": "simulated"}
