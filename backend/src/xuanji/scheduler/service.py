from __future__ import annotations

from collections.abc import Callable, Sequence

from xuanji.domain.enums import NodeKind
from xuanji.domain.models import HermesNode, Task
from xuanji.nodes.registry import NodeRegistry, supports_group

from .scoring import score_node


class SchedulerService:
    def __init__(self, latency_provider: Callable[[HermesNode], float] | None = None):
        self._latency_provider = latency_provider or (lambda _: 1000.0)

    def select_node(self, task: Task, nodes: Sequence[HermesNode]) -> HermesNode | None:
        candidates = NodeRegistry(nodes).eligible(task)
        policy = task.execution_policy

        if policy.mode == "fixed":
            candidates = [node for node in candidates if node.id == policy.node_id]
        elif policy.mode == "node_group":
            candidates = [node for node in candidates if supports_group(node, policy.node_group)]

        if not candidates:
            return None

        preferred_kind = {
            "local_first": NodeKind.LOCAL,
            "remote_first": NodeKind.REMOTE,
        }.get(policy.mode)
        if preferred_kind is not None:
            preferred = [node for node in candidates if node.kind is preferred_kind]
            if preferred:
                candidates = preferred

        ranked = sorted(
            candidates,
            key=lambda node: (-score_node(task, node, self._latency_provider(node)), node.id),
        )
        return ranked[0]
