"""LangGraph coordinates deterministic evaluation and risk routing."""

from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from src.cabinsentinel.rules import decide


class SafetyState(TypedDict, total=False):
    sensor: dict | None
    vision: dict | None
    now: object
    risk_level: str
    rule_id: str
    reason: str
    occupancy_state: str
    occupancy_reason_code: str
    evidence_conflicts: list[dict]
    seat_configuration_state: str
    actions: list[str]
    route: str


def evaluate(state: SafetyState) -> dict:
    return decide(state.get("sensor"), state.get("vision"), state["now"])


def risk_route(state: SafetyState) -> str:
    risk = state.get("risk_level", "ERROR")
    return risk.lower() if risk in {"SAFE", "NOTICE", "WARNING", "CRITICAL", "ERROR"} else "error"


def mark_route(name: str):
    def node(_state: SafetyState) -> dict:
        return {"route": name}

    return node


def build_safety_graph():
    graph = StateGraph(SafetyState)
    graph.add_node("evaluate", evaluate)
    graph.add_edge(START, "evaluate")
    for name in ("safe", "notice", "warning", "critical", "error"):
        graph.add_node(name, mark_route(name))
        graph.add_edge(name, END)
    graph.add_conditional_edges("evaluate", risk_route)
    return graph.compile()


safety_graph = build_safety_graph()
