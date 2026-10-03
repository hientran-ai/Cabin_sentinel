from src.cabinsentinel.graph import safety_graph
from tests.test_cabinsentinel import NOW, sensor, vision


def test_unresolved_incident_routes_warning_inside_graph_even_with_empty_current_frame():
    state = safety_graph.invoke(
        {
            "sensor": sensor().model_dump(mode="json"),
            "vision": vision([]).model_dump(mode="json"),
            "now": NOW,
            "unresolved_incident": True,
        }
    )
    assert state["risk_level"] == "WARNING"
    assert state["rule_id"] == "UNRESOLVED_OCCUPANT"
    assert state["route"] == "warning"
