from __future__ import annotations

from dataclasses import dataclass
from typing import Any, AsyncIterator, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


class NodeMessage(BaseModel):
    model_config = ConfigDict(extra="allow")


class NodeHealth(NodeMessage):
    status: Literal["ok", "degraded"]


class TaskInput(NodeMessage):
    source_task_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")

    @field_validator("path")
    @classmethod
    def safe_path(cls, value: str) -> str:
        parts = value.replace("\\", "/").split("/")
        if value.startswith(("/", "\\")) or not all(parts) or ".." in parts:
            raise ValueError("输入路径必须是安全的相对路径")
        return "/".join(parts)


class TaskOutputPolicy(NodeMessage):
    mode: Literal["strict", "discover"] = "discover"
    expected: list[str] = Field(default_factory=list)

    @field_validator("expected")
    @classmethod
    def safe_expected_paths(cls, value: list[str]) -> list[str]:
        for path in value:
            parts = path.replace("\\", "/").split("/")
            if path.startswith(("/", "\\")) or not all(parts) or ".." in parts:
                raise ValueError("输出路径必须是安全的相对路径")
        return [path.replace("\\", "/") for path in value]


class VerifyStep(NodeMessage):
    kind: Literal["command", "file_exists", "sha256", "manual"]
    value: str = Field(min_length=1, max_length=10_000)


class TaskDispatch(NodeMessage):
    idempotency_key: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$",
    )
    instruction: str = Field(min_length=1, max_length=200_000)
    project_id: str = Field(min_length=1)
    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    inputs: list[TaskInput] = Field(default_factory=list)
    output_policy: TaskOutputPolicy = Field(default_factory=TaskOutputPolicy)
    writes: list[str] = Field(default_factory=list)
    done_definition: list[str] = Field(default_factory=list)
    verify: list[VerifyStep] = Field(default_factory=list)
    run_gate: Literal["auto", "review_before_start", "review_before_complete"] = "auto"


class NodeTask(NodeMessage):
    id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    hermes_run_id: str | None = None
    error: str | None = None
    verify_results: list[dict[str, Any]] = Field(default_factory=list)


class NodeLogPage(NodeMessage):
    offset: int = Field(ge=0)
    next_offset: int = Field(ge=0)
    events: list[dict[str, Any]]


class NodeArtifact(NodeMessage):
    path: str = Field(min_length=1)
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class NodeArtifactList(NodeMessage):
    artifacts: list[NodeArtifact]


@dataclass(frozen=True)
class NodeArtifactDownload:
    body: bytes
    size: int
    sha256: str


@dataclass(frozen=True)
class NodeArtifactStream:
    body: AsyncIterator[bytes]
    size: int
    sha256: str
