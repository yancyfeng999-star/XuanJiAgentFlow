from __future__ import annotations

from collections.abc import Callable

from xuanji.domain.enums import RunStatus, TaskStatus
from xuanji.domain.models import Task, TaskAttempt, Workflow

_DEPENDENCY_COMPLETE = {TaskStatus.SUCCESS, TaskStatus.SKIPPED}
_SCHEDULABLE = {TaskStatus.PENDING, TaskStatus.READY, TaskStatus.RETRY_WAIT}


def ready_tasks(
    workflow: Workflow,
    attempts: dict[str, TaskAttempt],
    run_status: RunStatus,
    inputs_ready: Callable[[Task], bool],
) -> list[Task]:
    if run_status is not RunStatus.RUNNING:
        return []

    ready: list[Task] = []
    for task in workflow.tasks:
        attempt = attempts.get(task.id)
        if attempt is not None and attempt.status not in _SCHEDULABLE:
            continue
        if not all(
            dependency in attempts and attempts[dependency].status in _DEPENDENCY_COMPLETE
            for dependency in task.dependencies
        ):
            continue
        if inputs_ready(task):
            ready.append(task)
    return ready
