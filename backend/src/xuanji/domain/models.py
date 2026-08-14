from __future__ import annotations

from datetime import datetime, timezone
from pathlib import PurePosixPath
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, field_validator, model_validator

from .enums import NodeKind, NodeStatus, RunStatus, TaskStatus, WorkflowStatus


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DomainModel(BaseModel):
    model_config = ConfigDict(extra="forbid", validate_assignment=True, use_enum_values=False)


class Project(DomainModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    root_path: str = Field(min_length=1)
    active_workflow_version: int | None = Field(default=None, ge=1)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class ExecutionPolicy(DomainModel):
    mode: Literal["auto", "fixed", "node_group", "local_first", "remote_first"] = "auto"
    node_id: str | None = None
    node_group: str | None = None
    required_models: list[str] = Field(default_factory=list)
    required_tools: list[str] = Field(default_factory=list)
    required_tags: list[str] = Field(default_factory=list)
    timeout_seconds: int = Field(default=1800, gt=0)


class RetryPolicy(DomainModel):
    max_attempts: int = Field(default=3, ge=1)
    delay_seconds: float = Field(default=1.0, ge=0)


class ExpectedOutput(DomainModel):
    path: str = Field(min_length=1)
    media_type: str | None = None


class VerifyStep(DomainModel):
    kind: Literal["command", "file_exists", "sha256", "manual"]
    value: str = Field(min_length=1, max_length=10_000)


class UIPosition(DomainModel):
    x: float = 0
    y: float = 0


class Task(DomainModel):
    id: str = Field(min_length=1)
    workflow_id: str = Field(min_length=1)
    title: str = Field(min_length=1)
    description: str = ""
    prompt: str = ""
    agent_type: str = "general"
    dependencies: list[str] = Field(default_factory=list)
    execution_policy: ExecutionPolicy = Field(default_factory=ExecutionPolicy)
    retry_policy: RetryPolicy = Field(default_factory=RetryPolicy)
    expected_outputs: list[ExpectedOutput] = Field(default_factory=list)
    writes: list[str] = Field(default_factory=list)
    done_definition: list[str] = Field(default_factory=list)
    verify: list[VerifyStep] = Field(default_factory=list)
    run_gate: Literal["auto", "review_before_start", "review_before_complete"] = "auto"
    ui_position: UIPosition = Field(default_factory=UIPosition)

    @field_validator("writes")
    @classmethod
    def writes_are_safe(cls, value: list[str]) -> list[str]:
        for path in value:
            parts = path.replace("\\", "/").split("/")
            if path.startswith(("/", "\\")) or not all(parts) or ".." in parts:
                raise ValueError("写入路径必须是安全的相对路径")
        return [path.replace("\\", "/") for path in value]

    @field_validator("dependencies")
    @classmethod
    def dependencies_are_unique(cls, value: list[str]) -> list[str]:
        if any(not dependency for dependency in value):
            raise ValueError("依赖任务 ID 不能为空")
        if len(value) != len(set(value)):
            raise ValueError("依赖任务 ID 重复")
        return value


class Workflow(DomainModel):
    id: str = Field(min_length=1)
    project_id: str = Field(min_length=1)
    version: int = Field(ge=1)
    goal: str = Field(min_length=1)
    planner_provider: str | None = None
    planner_model: str | None = None
    thinking_model_id: str | None = None
    status: WorkflowStatus = WorkflowStatus.DRAFT
    graph_json: dict[str, Any] = Field(default_factory=dict)
    tasks: list[Task] = Field(default_factory=list)
    reviewed_at: datetime | None = None
    reviewed_by: str | None = None
    review_snapshot_hash: str | None = None
    review_warnings: list[str] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=utc_now)

    @model_validator(mode="after")
    def validate_graph(self) -> Workflow:
        ids = [task.id for task in self.tasks]
        if len(ids) != len(set(ids)):
            raise ValueError("任务 ID 重复")
        known = set(ids)
        for task in self.tasks:
            if task.workflow_id != self.id:
                raise ValueError(f"任务 {task.id} 的工作流 ID 与当前工作流不一致")
            for dependency in task.dependencies:
                if dependency not in known:
                    raise ValueError(f"任务 {task.id} 缺少依赖任务 {dependency}")
                if dependency == task.id:
                    raise ValueError(f"工作流在任务 {task.id} 处形成环")
        self._layers()
        return self

    def _layers(self) -> list[list[str]]:
        order = [task.id for task in self.tasks]
        remaining = {task.id: set(task.dependencies) for task in self.tasks}
        layers: list[list[str]] = []
        while remaining:
            ready = [task_id for task_id in order if task_id in remaining and not remaining[task_id]]
            if not ready:
                cycle_members = ", ".join(task_id for task_id in order if task_id in remaining)
                raise ValueError(f"工作流存在环，涉及任务：{cycle_members}")
            layers.append(ready)
            for task_id in ready:
                remaining.pop(task_id)
            for dependencies in remaining.values():
                dependencies.difference_update(ready)
        return layers

    def topological_order(self) -> list[str]:
        return [task_id for layer in self._layers() for task_id in layer]

    def parallel_layers(self) -> list[list[str]]:
        return self._layers()


class Run(DomainModel):
    id: str = Field(min_length=1)
    workflow_id: str = Field(min_length=1)
    status: RunStatus = RunStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime = Field(default_factory=utc_now)


class TaskAttempt(DomainModel):
    id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    node_id: str | None = None
    attempt: int = Field(ge=1)
    status: TaskStatus = TaskStatus.PENDING
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error: dict[str, Any] | None = None
    result_manifest: dict[str, Any] | None = None


class HermesNode(DomainModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    kind: NodeKind
    api_url: HttpUrl
    ssh_host: str | None = None
    ssh_port: int | None = Field(default=None, ge=1, le=65535)
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    status: NodeStatus = NodeStatus.UNKNOWN
    capabilities_json: dict[str, Any] = Field(default_factory=dict)
    max_concurrency: int = Field(default=1, ge=1)
    running_tasks: int = Field(default=0, ge=0)
    success_rate: float = Field(default=1.0, ge=0, le=1)
    last_seen_at: datetime | None = None


class Artifact(DomainModel):
    id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    attempt_id: str | None = None
    relative_path: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    created_at: datetime = Field(default_factory=utc_now)

    @field_validator("relative_path")
    @classmethod
    def relative_path_is_safe(cls, value: str) -> str:
        path = PurePosixPath(value)
        if path.is_absolute() or ".." in path.parts:
            raise ValueError("产物路径必须是安全的相对路径")
        return value
