from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


class ArtifactEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    media_type: str = Field(min_length=1)
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class ArtifactManifest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: str = Field(min_length=1)
    task_id: str = Field(min_length=1)
    artifacts: list[ArtifactEntry]
    verified_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
