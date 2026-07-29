from __future__ import annotations

from xuanji.domain.models import HermesNode, Task


def _values(node: HermesNode, key: str) -> set[str]:
    value = node.capabilities_json.get(key, [])
    return {item for item in value if isinstance(item, str)} if isinstance(value, list) else set()


def _coverage(required: list[str], available: set[str]) -> float:
    return 1.0 if not required else len(set(required) & available) / len(set(required))


def score_node(task: Task, node: HermesNode, latency_ms: float) -> float:
    policy = task.execution_policy
    tool_score = _coverage(policy.required_tools, _values(node, "tools"))
    tag_score = _coverage(policy.required_tags, _values(node, "tags"))
    capability_score = (tool_score + tag_score) / 2
    load_score = max(0.0, 1.0 - node.running_tasks / node.max_concurrency)
    model_score = _coverage(policy.required_models, _values(node, "models"))
    latency_score = max(0.0, min(1.0, 1.0 - max(0.0, latency_ms) / 1000.0))

    return (
        capability_score * 0.35
        + load_score * 0.25
        + model_score * 0.20
        + latency_score * 0.10
        + node.success_rate * 0.10
    )
