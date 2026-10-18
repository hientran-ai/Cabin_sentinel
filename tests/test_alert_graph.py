from src.cabinsentinel.graph import safety_graph
from tests.test_cabinsentinel import NOW, sensor, vision


def test_unresolved_incident_keeps_negative_vision_unverified_in_error_route():
    state = safety_graph.invoke(
        {
            "sensor": sensor().model_dump(mode="json"),
            "vision": vision([]).model_dump(mode="json"),
            "now": NOW,
            "unresolved_incident": True,
        }
    )
    assert state["risk_level"] == "ERROR"
    assert state["occupancy_state"] == "UNKNOWN"
    assert state["rule_id"] == "OCCUPANCY_UNVERIFIED"
    assert state["route"] == "error"
