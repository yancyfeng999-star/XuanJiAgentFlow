from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class NodeMessage(BaseModel):
    model_config = ConfigDict(extra="allow")


class NodeHealth(NodeMessage):
    status: Literal["ok", "degraded"]


class NodeTask(NodeMessage):
    id: str = Field(min_length=1)
    status: str = Field(min_length=1)
    hermes_run_id: str | None = None
    error: str | None = None


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
