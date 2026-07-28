from __future__ import annotations

from typing import Any

from xuanji.domain.enums import RUN_TRANSITIONS, TASK_TRANSITIONS, RunStatus, TaskStatus


class StateTransitionError(Exception):
    def __init__(self, code: str, message: str, details: dict[str, Any]):
        super().__init__(message)
        self.code = code
        self.details = details


def transition_task(current: TaskStatus, target: TaskStatus) -> TaskStatus:
    if target not in TASK_TRANSITIONS[current]:
        raise StateTransitionError(
            "illegal_task_transition",
            f"illegal task status transition: {current.value} -> {target.value}",
            {"current": current.value, "target": target.value},
        )
    return target


def transition_run(current: RunStatus, target: RunStatus) -> RunStatus:
    if target not in RUN_TRANSITIONS[current]:
        raise StateTransitionError(
            "illegal_run_transition",
            f"illegal run status transition: {current.value} -> {target.value}",
            {"current": current.value, "target": target.value},
        )
    return target
