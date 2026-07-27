from __future__ import annotations

import json
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from pydantic import BaseModel, Field

from executor import HermesNodeClient, NodeExecutor


class CreateTaskRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=200_000)
    idempotency_key: str | None = None


def create_app(
    root: Path | None = None,
    token: str | None = None,
    hermes_url: str | None = None,
    hermes_token: str | None = None,
) -> FastAPI:
    from pathlib import Path as _P
    import os

    root = root or _P(os.getenv("XUANJI_NODE_ROOT", "~/.xuanji-node/tasks")).expanduser()
    token = token if token is not None else os.getenv("XUANJI_NODE_TOKEN", "")
    hermes_url = hermes_url or os.getenv("HERMES_API_URL", "http://127.0.0.1:8642")
    hermes_token = hermes_token or os.getenv("HERMES_API_KEY", "")

    client = HermesNodeClient(hermes_url, hermes_token)
    executor = NodeExecutor(root, client)
    app = FastAPI(title="Xuanji Hermes Node", version="0.2.0")
    app.state.executor = executor

    async def authorize(authorization: str | None = Header(default=None)) -> None:
        if token and authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "invalid node token"})

    @app.get("/v1/health")
    async def health(_: None = Depends(authorize)) -> dict:
        caps = executor.capabilities()
        return {"status": "ok" if caps["hermes_available"] else "degraded", **caps}

    @app.get("/v1/capabilities")
    async def capabilities(_: None = Depends(authorize)) -> dict:
        return executor.capabilities()

    @app.post("/v1/tasks", status_code=202)
    async def create_task(request: CreateTaskRequest, _: None = Depends(authorize)) -> dict:
        task_id = request.idempotency_key or None
        record = executor.create(request.goal, task_id)
        record = executor.start(record.id)
        return record.__dict__

    @app.get("/v1/tasks/{task_id}")
    async def get_task(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            record = executor.poll(task_id)
            return record.__dict__
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": task_id})

    @app.post("/v1/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            return executor.cancel(task_id).__dict__
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": task_id})

    @app.get("/v1/tasks/{task_id}/logs")
    async def task_logs(task_id: str, offset: int = Query(default=0, ge=0), _: None = Depends(authorize)) -> dict:
        try:
            events = executor.logs(task_id, offset)
            return {"offset": offset, "next_offset": offset + len(events), "events": events}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": task_id})

    @app.get("/v1/tasks/{task_id}/artifacts")
    async def task_artifacts(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            return {"artifacts": executor.artifacts(task_id)}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": task_id})

    return app


app = create_app()
