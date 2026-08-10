from __future__ import annotations

from fastapi import APIRouter, Request
from pydantic import BaseModel, ConfigDict, Field, HttpUrl

router = APIRouter(prefix="/api/planner", tags=["planner"])


class PlannerConfigRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_url: HttpUrl
    model: str = Field(min_length=1, max_length=500)
    credential_key: str = Field(min_length=1, max_length=500)
    credential: str | None = Field(default=None, min_length=1, max_length=1_000_000)


def _payload(config: dict[str, str] | None, credential_configured: bool | None) -> dict:
    if config is None:
        return {
            "base_url": None,
            "model": None,
            "credential_key": None,
            "credential_configured": False,
        }
    return {**config, "credential_configured": credential_configured}


@router.get("/config")
async def get_config(request: Request) -> dict:
    services = request.app.state.services
    config = services.app_config.get("planner")
    if config is None:
        return _payload(None, False)
    credential_configured = services.credentials.get(config["credential_key"]) is not None
    return _payload(config, credential_configured)


@router.put("/config")
async def set_config(payload: PlannerConfigRequest, request: Request) -> dict:
    services = request.app.state.services
    config = {
        "base_url": str(payload.base_url).rstrip("/"),
        "model": payload.model,
        "credential_key": payload.credential_key,
    }
    if payload.credential is not None:
        services.credentials.set(payload.credential_key, payload.credential)
    services.app_config.set("planner", config)
    services.planner = services.planner_factory(config, services.credentials)
    credential_configured = services.credentials.get(payload.credential_key) is not None
    return _payload(config, credential_configured)
