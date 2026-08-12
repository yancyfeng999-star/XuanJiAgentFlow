from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["readiness"])


@router.get("/api/readiness")
async def get_readiness(
    request: Request,
    project_id: str | None = Query(default=None),
    workflow_id: str | None = Query(default=None),
    mode: Literal["local", "deep"] = Query(default="local"),
) -> dict:
    services = request.app.state.services
    return await services.readiness.check(
        project_id=project_id,
        workflow_id=workflow_id,
        mode=mode,
    )
