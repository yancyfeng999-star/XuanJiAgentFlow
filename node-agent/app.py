from __future__ import annotations

import json
from pathlib import Path

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException, Query, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field, model_validator

from executor import HermesCliClient, HermesNodeClient, NodeExecutor


class TaskInputRequest(BaseModel):
    source_task_id: str = Field(min_length=1)
    path: str = Field(min_length=1)
    size: int = Field(ge=0)
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class OutputPolicyRequest(BaseModel):
    mode: str = Field(pattern=r"^(strict|discover)$")
    expected: list[str] = Field(default_factory=list)


class CreateTaskRequest(BaseModel):
    instruction: str | None = Field(default=None, min_length=1, max_length=200_000)
    goal: str | None = Field(default=None, min_length=1, max_length=200_000)
    project_id: str = Field(default="legacy", min_length=1)
    run_id: str = Field(default="legacy", min_length=1)
    task_id: str = Field(default="legacy", min_length=1)
    inputs: list[TaskInputRequest] = Field(default_factory=list)
    output_policy: OutputPolicyRequest = Field(default_factory=lambda: OutputPolicyRequest(mode="discover"))
    idempotency_key: str = Field(
        min_length=1,
        max_length=128,
        pattern=r"^[A-Za-z0-9](?:[A-Za-z0-9._:-]{0,126}[A-Za-z0-9])?$",
    )

    @model_validator(mode="after")
    def normalize_instruction(self) -> "CreateTaskRequest":
        self.instruction = self.instruction or self.goal
        if not self.instruction:
            raise ValueError("任务指令不能为空")
        if self.task_id == "legacy":
            self.task_id = self.idempotency_key
        return self


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
    hermes_mode = os.getenv("HERMES_MODE", "api")

    client = HermesCliClient(root) if hermes_mode == "cli" else HermesNodeClient(hermes_url, hermes_token)
    executor = NodeExecutor(root, client)
    app = FastAPI(title="Xuanji Hermes Node", version="0.2.0")
    app.state.executor = executor

    @app.exception_handler(RequestValidationError)
    async def validation_error_handler(
        _request: Request,
        _exc: RequestValidationError,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content={
                "detail": {
                    "code": "validation_error",
                    "message": "请求参数校验失败",
                }
            },
        )

    async def authorize(authorization: str | None = Header(default=None)) -> None:
        if token and authorization != f"Bearer {token}":
            raise HTTPException(status_code=401, detail={"code": "unauthorized", "message": "节点 Token 无效"})

    @app.get("/v1/health")
    async def health(_: None = Depends(authorize)) -> dict:
        caps = executor.capabilities()
        return {"status": "ok" if caps["hermes_available"] else "degraded", **caps}

    @app.get("/v1/capabilities")
    async def capabilities(_: None = Depends(authorize)) -> dict:
        return executor.capabilities()

    @app.post("/v1/tasks", status_code=202)
    async def create_task(request: CreateTaskRequest, _: None = Depends(authorize)) -> dict:
        try:
            record = executor.create(request.model_dump(mode="json", exclude={"goal"}))
            if request.goal is not None:
                record = executor.start(record.id)
            return record.__dict__
        except FileExistsError:
            raise HTTPException(
                status_code=409,
                detail={"code": "idempotency_conflict", "message": "相同幂等键对应了不同任务内容"},
            ) from None

    @app.put("/v1/tasks/{task_id}/inputs/{input_path:path}")
    async def upload_input(
        task_id: str,
        input_path: str,
        request: Request,
        input_size: int = Header(alias="X-Input-Size"),
        input_sha256: str = Header(alias="X-Input-SHA256"),
        _: None = Depends(authorize),
    ) -> dict:
        try:
            return executor.upload_input(
                task_id,
                input_path,
                await request.body(),
                size=input_size,
                sha256=input_sha256,
            )
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"}) from None
        except KeyError:
            raise HTTPException(status_code=404, detail={"code": "input_not_declared", "message": "该输入文件未在任务中声明"}) from None
        except RuntimeError as exc:
            raise HTTPException(status_code=409, detail={"code": "task_already_started", "message": "任务已经开始执行"}) from None
        except ValueError as exc:
            raise HTTPException(status_code=400, detail={"code": "invalid_input", "message": str(exc)}) from None

    @app.post("/v1/tasks/{task_id}/start")
    async def start_task(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            return executor.start(task_id).__dict__
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"}) from None

    @app.get("/v1/tasks/{task_id}")
    async def get_task(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            record = executor.poll(task_id)
            return record.__dict__
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"})

    @app.post("/v1/tasks/{task_id}/cancel")
    async def cancel_task(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            return executor.cancel(task_id).__dict__
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"})

    @app.get("/v1/tasks/{task_id}/logs")
    async def task_logs(task_id: str, offset: int = Query(default=0, ge=0), _: None = Depends(authorize)) -> dict:
        try:
            events = executor.logs(task_id, offset)
            return {"offset": offset, "next_offset": offset + len(events), "events": events}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"})

    @app.get("/v1/tasks/{task_id}/artifacts")
    async def task_artifacts(task_id: str, _: None = Depends(authorize)) -> dict:
        try:
            return {"artifacts": executor.artifacts(task_id)}
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail={"code": "task_not_found", "message": "任务不存在"})

    @app.get("/v1/tasks/{task_id}/artifacts/{artifact_path:path}")
    async def download_artifact(
        task_id: str,
        artifact_path: str,
        _: None = Depends(authorize),
    ) -> StreamingResponse:
        try:
            artifact, size, digest = executor.artifact(task_id, artifact_path)
        except ValueError:
            raise HTTPException(
                status_code=400,
                detail={"code": "unsafe_artifact_path", "message": "产物路径不安全"},
            ) from None
        except FileNotFoundError:
            raise HTTPException(
                status_code=404,
                detail={"code": "artifact_not_found", "message": "产物不存在"},
            ) from None
        return StreamingResponse(
            executor.stream_artifact(artifact),
            media_type="application/octet-stream",
            headers={
                "Content-Length": str(size),
                "X-Artifact-Size": str(size),
                "X-Artifact-SHA256": digest,
            },
        )

    return app


def main() -> None:
    import os

    import uvicorn

    uvicorn.run(
        app,
        host=os.getenv("XUANJI_NODE_HOST", "127.0.0.1"),
        port=int(os.getenv("XUANJI_NODE_PORT", "8765")),
    )


app = create_app()

if __name__ == "__main__":
    main()
