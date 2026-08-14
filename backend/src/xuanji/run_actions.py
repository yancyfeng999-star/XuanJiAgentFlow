from __future__ import annotations

from xuanji.domain.enums import RunStatus, TaskStatus
from xuanji.domain.models import Run, Task, TaskAttempt

TERMINAL_RUN_STATUSES = {RunStatus.CANCELLED, RunStatus.SUCCESS, RunStatus.SUCCESS_WITH_WARNINGS, RunStatus.FAILED}

_RETRYABLE_TASK_STATUSES = {
    TaskStatus.FAILED,
    TaskStatus.ARTIFACT_FAILED,
    TaskStatus.DISPATCH_FAILED,
    TaskStatus.BLOCKED,
    TaskStatus.NEEDS_REVIEW,
}
_SKIPPABLE_TASK_STATUSES = {TaskStatus.PENDING, TaskStatus.READY, TaskStatus.NEEDS_REVIEW}


def run_allowed_actions(run: Run) -> list[str]:
    actions: list[str] = []
    if run.status is RunStatus.PENDING:
        actions.append("start")
    if run.status is RunStatus.RUNNING:
        actions.append("pause")
    if run.status in {RunStatus.PAUSED, RunStatus.BLOCKED}:
        actions.append("resume")
    if run.status not in TERMINAL_RUN_STATUSES and run.status is not RunStatus.CANCELLING:
        actions.append("cancel")
    return actions


def task_allowed_actions(run: Run, task: Task, latest: TaskAttempt | None) -> list[str]:
    if run.status in TERMINAL_RUN_STATUSES or run.status is RunStatus.CANCELLING:
        return []
    actions: list[str] = []
    if (
        latest is not None
        and latest.status in _RETRYABLE_TASK_STATUSES
        and latest.attempt < task.retry_policy.max_attempts
    ):
        actions.append("retry")
    if latest is None or latest.status in _SKIPPABLE_TASK_STATUSES:
        actions.append("skip")
    return actions
