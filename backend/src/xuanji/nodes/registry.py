from __future__ import annotations

from collections.abc import Iterable

from xuanji.domain.enums import NodeStatus
from xuanji.domain.models import HermesNode, Task


def _capabilities(node: HermesNode, key: str) -> set[str]:
    values = node.capabilities_json.get(key, [])
    return {value for value in values if isinstance(value, str)} if isinstance(values, list) else set()


def supports_task(node: HermesNode, task: Task) -> bool:
    policy = task.execution_policy
    return (
        set(policy.required_models) <= _capabilities(node, "models")
        and set(policy.required_tools) <= _capabilities(node, "tools")
        and set(policy.required_tags) <= _capabilities(node, "tags")
    )


def supports_group(node: HermesNode, group: str | None) -> bool:
    return group is not None and group in _capabilities(node, "tags")


class NodeRegistry:
    def __init__(self, nodes: Iterable[HermesNode] = ()):
        self._nodes = {node.id: node for node in nodes}

    def upsert(self, node: HermesNode) -> None:
        self._nodes[node.id] = node

    def remove(self, node_id: str) -> None:
        self._nodes.pop(node_id, None)

    def list(self) -> list[HermesNode]:
        return sorted(self._nodes.values(), key=lambda node: node.id)

    def eligible(self, task: Task) -> list[HermesNode]:
        return [
            node
            for node in self.list()
            if node.status is NodeStatus.ONLINE
            and node.running_tasks < node.max_concurrency
            and supports_task(node, task)
        ]
