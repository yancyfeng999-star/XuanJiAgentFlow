from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from xuanji.thinking_models import ThinkingModelError

router = APIRouter(prefix="/api/thinking-models", tags=["thinking-models"])


class ThinkingModelWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str = Field(min_length=1, max_length=200)
    provider_kind: Literal["openai"] = "openai"
    api_mode: Literal["responses", "chat_completions"]
    base_url: HttpUrl
    model_id: str = Field(min_length=1, max_length=500)
    enabled: bool = True
    is_default: bool = False
    reasoning_effort: Literal["none", "low", "medium", "high", "xhigh"] | None = None
    credential: str | None = Field(default=None, min_length=1, max_length=1_000_000)


class ThinkingModelPatch(BaseModel):
    model_config = ConfigDict(extra="forbid")

    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    api_mode: Literal["responses", "chat_completions"] | None = None
    base_url: HttpUrl | None = None
    model_id: str | None = Field(default=None, min_length=1, max_length=500)
    enabled: bool | None = None
    is_default: bool | None = None
    reasoning_effort: Literal["none", "low", "medium", "high", "xhigh"] | None = None
    credential: str | None = Field(default=None, min_length=1, max_length=1_000_000)


def _error(exc: ThinkingModelError, status_code: int = 404) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": exc.code, "message": exc.message, "details": {}}},
    )


@router.get("")
async def list_models(request: Request) -> dict[str, Any]:
    return {"items": request.app.state.services.thinking_models.list_public()}


@router.post("")
async def create_model(payload: ThinkingModelWrite, request: Request) -> dict[str, Any]:
    return request.app.state.services.thinking_models.create(payload.model_dump(mode="json"), payload.credential)


@router.patch("/{profile_id}")
async def update_model(profile_id: str, payload: ThinkingModelPatch, request: Request) -> dict[str, Any]:
    try:
        return request.app.state.services.thinking_models.update(
            profile_id, payload.model_dump(mode="json", exclude_unset=True), payload.credential
        )
    except ThinkingModelError as exc:
        return _error(exc)


@router.delete("/{profile_id}")
async def delete_model(profile_id: str, request: Request) -> JSONResponse:
    try:
        request.app.state.services.thinking_models.delete(profile_id)
    except ThinkingModelError as exc:
        status = 409 if exc.code == "thinking_model_default_conflict" else 404
        return _error(exc, status)
    return JSONResponse(status_code=204, content=None)


@router.put("/{profile_id}/default")
async def set_default(profile_id: str, request: Request) -> dict[str, Any]:
    try:
        return request.app.state.services.thinking_models.set_default(profile_id)
    except ThinkingModelError as exc:
        return _error(exc)
