from __future__ import annotations

import hashlib
import json
from typing import Any

from xuanji.domain.enums import NodeStatus
from xuanji.domain.models import HermesNode, Task, Workflow
from xuanji.nodes.registry import supports_group, supports_task

_SNAPSHOT_TASK_FIELDS = (
    "id",
    "title",
    "description",
    "prompt",
    "agent_type",
    "dependencies",
    "execution_policy",
    "retry_policy",
    "expected_outputs",
)


def canonical_snapshot(workflow: Workflow) -> dict[str, Any]:
    tasks = sorted(workflow.tasks, key=lambda task: task.id)
    return {
        "workflow_id": workflow.id,
        "project_id": workflow.project_id,
        "version": workflow.version,
        "goal": workflow.goal,
        "tasks": [
            {
                field: task.model_dump(mode="json")[field]
                for field in _SNAPSHOT_TASK_FIELDS
            }
            for task in tasks
        ],
    }


def snapshot_hash(workflow: Workflow) -> str:
    canonical = json.dumps(
        canonical_snapshot(workflow),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _matching_nodes(task: Task, nodes: list[HermesNode]) -> list[HermesNode]:
    policy = task.execution_policy
    candidates = [
        node for node in nodes
        if node.status is NodeStatus.ONLINE and supports_task(node, task)
    ]
    if policy.mode == "fixed":
        candidates = [node for node in candidates if node.id == policy.node_id]
    elif policy.mode == "node_group":
        candidates = [node for node in candidates if supports_group(node, policy.node_group)]
    return candidates


def prepare_review(workflow: Workflow, nodes: list[HermesNode]) -> dict[str, Any]:
    blockers: list[dict[str, Any]] = []
    warnings: list[dict[str, Any]] = []
    task_summaries: list[dict[str, Any]] = []

    if not workflow.tasks:
        blockers.append({
            "code": "workflow_empty",
            "title": "工作流没有任务",
            "message": "请重新规划或为工作流添加任务。",
        })

    for task in sorted(workflow.tasks, key=lambda item: item.id):
        matched = _matching_nodes(task, nodes)
        writes = [output.path for output in task.expected_outputs]
        if not matched:
            warnings.append({
                "code": "task_without_matching_node",
                "task_id": task.id,
                "title": f"任务“{task.title}”当前没有匹配的在线节点",
                "message": "执行前需要至少一个在线节点满足该任务要求。",
            })
        if not writes:
            warnings.append({
                "code": "task_without_expected_outputs",
                "task_id": task.id,
                "title": f"任务“{task.title}”未声明预期产物",
                "message": "没有预期产物的任务无法机械验证交付结果。",
            })
        task_summaries.append({
            "task_id": task.id,
            "title": task.title,
            "dependencies": list(task.dependencies),
            "writes": sorted(set(writes) | set(task.writes)),
            "done_definition": list(task.done_definition),
            "verify": [step.model_dump(mode="json") for step in task.verify],
            "run_gate": task.run_gate,
            "matching_node_ids": [node.id for node in matched],
            "timeout_seconds": task.execution_policy.timeout_seconds,
        })

    return {
        "snapshot": canonical_snapshot(workflow),
        "snapshot_hash": snapshot_hash(workflow),
        "topological_order": workflow.topological_order() if workflow.tasks else [],
        "task_count": len(workflow.tasks),
        "tasks": task_summaries,
        "blockers": blockers,
        "warnings": warnings,
    }
