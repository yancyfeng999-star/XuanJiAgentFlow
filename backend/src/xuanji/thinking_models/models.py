from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class ThinkingModelProfile(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    display_name: str = Field(min_length=1, max_length=200)
    provider_kind: Literal["openai"] = "openai"
    api_mode: Literal["responses", "chat_completions"]
    base_url: HttpUrl
    model_id: str = Field(min_length=1, max_length=500)
    credential_key: str = Field(min_length=1, max_length=500)
    enabled: bool = True
    is_default: bool = False
    reasoning_effort: Literal["none", "low", "medium", "high", "xhigh"] | None = None
    last_test_status: Literal["untested", "ok", "failed"] = "untested"
    last_tested_at: datetime | None = None


class ThinkingModelPublic(BaseModel):
    id: str
    display_name: str
    provider_kind: str
    api_mode: str
    base_url: str
    model_id: str
    credential_key: str
    enabled: bool
    is_default: bool
    reasoning_effort: str | None
    last_test_status: str
    last_tested_at: datetime | None
    credential_configured: bool
