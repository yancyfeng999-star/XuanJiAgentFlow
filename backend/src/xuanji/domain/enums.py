from enum import StrEnum


class WorkflowStatus(StrEnum):
    DRAFT = "draft"
    REVIEWED = "reviewed"
    ARCHIVED = "archived"


class RunStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    PAUSED = "paused"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    SUCCESS = "success"
    FAILED = "failed"
    BLOCKED = "blocked"


class TaskStatus(StrEnum):
    PENDING = "pending"
    READY = "ready"
    DISPATCHING = "dispatching"
    DISPATCH_FAILED = "dispatch_failed"
    RUNNING = "running"
    COLLECTING = "collecting"
    ARTIFACT_FAILED = "artifact_failed"
    SUCCESS = "success"
    FAILED = "failed"
    RETRY_WAIT = "retry_wait"
    CANCELLING = "cancelling"
    CANCELLED = "cancelled"
    SKIPPED = "skipped"
    BLOCKED = "blocked"


class NodeKind(StrEnum):
    LOCAL = "local"
    REMOTE = "remote"


class NodeStatus(StrEnum):
    UNKNOWN = "unknown"
    ONLINE = "online"
    OFFLINE = "offline"
    DEGRADED = "degraded"


TASK_TRANSITIONS: dict[TaskStatus, set[TaskStatus]] = {
    TaskStatus.PENDING: {TaskStatus.READY, TaskStatus.CANCELLED, TaskStatus.SKIPPED, TaskStatus.BLOCKED},
    TaskStatus.READY: {TaskStatus.DISPATCHING, TaskStatus.CANCELLED, TaskStatus.SKIPPED, TaskStatus.BLOCKED},
    TaskStatus.DISPATCHING: {TaskStatus.RUNNING, TaskStatus.DISPATCH_FAILED, TaskStatus.BLOCKED},
    TaskStatus.DISPATCH_FAILED: {TaskStatus.RETRY_WAIT, TaskStatus.FAILED, TaskStatus.BLOCKED},
    TaskStatus.RUNNING: {TaskStatus.COLLECTING, TaskStatus.FAILED, TaskStatus.CANCELLING, TaskStatus.BLOCKED},
    TaskStatus.COLLECTING: {TaskStatus.SUCCESS, TaskStatus.ARTIFACT_FAILED, TaskStatus.BLOCKED},
    TaskStatus.ARTIFACT_FAILED: {TaskStatus.RETRY_WAIT, TaskStatus.FAILED, TaskStatus.BLOCKED},
    TaskStatus.FAILED: {TaskStatus.RETRY_WAIT},
    TaskStatus.RETRY_WAIT: {TaskStatus.READY, TaskStatus.BLOCKED},
    TaskStatus.CANCELLING: {TaskStatus.CANCELLED},
    TaskStatus.BLOCKED: {TaskStatus.PENDING, TaskStatus.READY, TaskStatus.CANCELLED},
    TaskStatus.SUCCESS: set(),
    TaskStatus.CANCELLED: set(),
    TaskStatus.SKIPPED: set(),
}

RUN_TRANSITIONS: dict[RunStatus, set[RunStatus]] = {
    RunStatus.PENDING: {RunStatus.RUNNING, RunStatus.CANCELLING, RunStatus.CANCELLED, RunStatus.BLOCKED},
    RunStatus.RUNNING: {RunStatus.PAUSED, RunStatus.CANCELLING, RunStatus.SUCCESS, RunStatus.FAILED, RunStatus.BLOCKED},
    RunStatus.PAUSED: {RunStatus.RUNNING, RunStatus.CANCELLING, RunStatus.BLOCKED},
    RunStatus.CANCELLING: {RunStatus.CANCELLED},
    RunStatus.BLOCKED: {RunStatus.PENDING, RunStatus.RUNNING, RunStatus.CANCELLING},
    RunStatus.CANCELLED: set(),
    RunStatus.SUCCESS: set(),
    RunStatus.FAILED: set(),
}


def ensure_task_transition(current: TaskStatus, target: TaskStatus) -> None:
    if target not in TASK_TRANSITIONS[current]:
        raise ValueError(f"不允许的任务状态转换：{current.value} → {target.value}")


def ensure_run_transition(current: RunStatus, target: RunStatus) -> None:
    if target not in RUN_TRANSITIONS[current]:
        raise ValueError(f"不允许的运行状态转换：{current.value} → {target.value}")
