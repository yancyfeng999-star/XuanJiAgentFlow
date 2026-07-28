from __future__ import annotations

import hashlib
from dataclasses import asdict, dataclass
from enum import StrEnum
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from typing import AsyncIterator

import httpx
from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel


class FakeNodeMode(StrEnum):
    SUCCESS = "success"
    FAILURE = "failure"
    DELAY = "delay"
    OFFLINE = "offline"
    BAD_HASH = "bad_hash"
    BAD_DOWNLOAD_HEADERS = "bad_download_headers"


class CreateTaskRequest(BaseModel):
    goal: str
    idempotency_key: str


@dataclass
class FakeTask:
    id: str
    status: str
    goal: str
    hermes_run_id: str
    error: str | None = None
    polls: int = 0


class _OfflineTransport(httpx.AsyncBaseTransport):
    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("fake node is offline", request=request)


class FakeNode:
    """Stateful protocol-faithful node used by Execution integration tests."""

    def __init__(
        self,
        mode: FakeNodeMode | str = FakeNodeMode.SUCCESS,
        *,
        token: str = "fake-node-token",
        delay_polls: int = 2,
        root: Path | None = None,
    ) -> None:
        self.mode = FakeNodeMode(mode)
        self.token = token
        self.delay_polls = delay_polls
        self.tasks: dict[str, FakeTask] = {}
        self.create_calls = 0
        self.cancel_calls = 0
        self._temporary_root = TemporaryDirectory() if root is None else None
        self.root = Path(root or self._temporary_root.name).resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.app = self._create_app()

    def transport(self) -> httpx.AsyncBaseTransport:
        if self.mode is FakeNodeMode.OFFLINE:
            return _OfflineTransport()
        return httpx.ASGITransport(app=self.app)

    def client(self, base_url: str = "http://fake-node") -> httpx.AsyncClient:
        return httpx.AsyncClient(transport=self.transport(), base_url=base_url)

    def close(self) -> None:
        if self._temporary_root is not None:
            self._temporary_root.cleanup()
            self._temporary_root = None

    def __enter__(self) -> FakeNode:
        return self

    def __exit__(self, *_: object) -> None:
        self.close()

    def _create_app(self) -> FastAPI:
        app = FastAPI()

        async def authorize(authorization: str | None = Header(default=None)) -> None:
            if authorization != f"Bearer {self.token}":
                raise HTTPException(status_code=401, detail="unauthorized")

        @app.get("/v1/health")
        async def health(_: None = Depends(authorize)) -> dict:
            return {"status": "ok", "models": ["fake-model"], "tools": ["terminal"]}

        @app.get("/v1/capabilities")
        async def capabilities(_: None = Depends(authorize)) -> dict:
            return {"models": ["fake-model"], "tools": ["terminal"], "tags": ["fake"]}

        @app.post("/v1/tasks", status_code=202)
        async def create_task(request: CreateTaskRequest, _: None = Depends(authorize)) -> dict:
            existing = self.tasks.get(request.idempotency_key)
            if existing is not None:
                return asdict(existing)
            self.create_calls += 1
            task = FakeTask(
                id=request.idempotency_key,
                status="running",
                goal=request.goal,
                hermes_run_id=f"hermes-{request.idempotency_key}",
            )
            self.tasks[task.id] = task
            return asdict(task)

        @app.get("/v1/tasks/{task_id}")
        async def get_task(task_id: str, _: None = Depends(authorize)) -> dict:
            task = self._task(task_id)
            if task.status == "running":
                task.polls += 1
                if self.mode is FakeNodeMode.FAILURE:
                    task.status = "failed"
                    task.error = "fake node task failed"
                elif self.mode is not FakeNodeMode.DELAY or task.polls > self.delay_polls:
                    task.status = "success"
                    self._write_artifact(task)
            return asdict(task)

        @app.post("/v1/tasks/{task_id}/cancel")
        async def cancel_task(task_id: str, _: None = Depends(authorize)) -> dict:
            self.cancel_calls += 1
            task = self._task(task_id)
            task.status = "cancelled"
            return asdict(task)

        @app.get("/v1/tasks/{task_id}/logs")
        async def logs(task_id: str, offset: int = 0, _: None = Depends(authorize)) -> dict:
            task = self._task(task_id)
            events = [{"event": "status", "status": task.status}]
            page = events[offset:]
            return {"offset": offset, "next_offset": offset + len(page), "events": page}

        @app.get("/v1/tasks/{task_id}/artifacts")
        async def artifacts(task_id: str, _: None = Depends(authorize)) -> dict:
            task = self._task(task_id)
            path = self._artifact_path(task)
            if not path.exists():
                return {"artifacts": []}
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if self.mode is FakeNodeMode.BAD_HASH:
                digest = "0" * 64 if digest != "0" * 64 else "1" * 64
            return {
                "artifacts": [
                    {"path": path.name, "size": path.stat().st_size, "sha256": digest}
                ]
            }

        @app.get("/v1/tasks/{task_id}/artifacts/{artifact_path:path}")
        async def download_artifact(
            task_id: str,
            artifact_path: str,
            _: None = Depends(authorize),
        ) -> StreamingResponse:
            task = self._task(task_id)
            path = self._resolve_artifact(task, artifact_path)
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            size = str(path.stat().st_size)
            if self.mode is FakeNodeMode.BAD_DOWNLOAD_HEADERS:
                size = "invalid"
            return StreamingResponse(
                self._stream(path),
                media_type="application/octet-stream",
                headers={
                    "Content-Length": str(path.stat().st_size),
                    "X-Artifact-Size": size,
                    "X-Artifact-SHA256": digest,
                },
            )

        return app

    def _task(self, task_id: str) -> FakeTask:
        try:
            return self.tasks[task_id]
        except KeyError:
            raise HTTPException(status_code=404, detail="task not found") from None

    def _task_dir(self, task: FakeTask) -> Path:
        return self.root / task.id

    def _artifact_path(self, task: FakeTask) -> Path:
        return self._task_dir(task) / "artifacts" / "result.txt"

    def _write_artifact(self, task: FakeTask) -> None:
        path = self._artifact_path(task)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(f"result for {task.goal}", encoding="utf-8")

    def _resolve_artifact(self, task: FakeTask, artifact_path: str) -> Path:
        relative = PurePosixPath(artifact_path)
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise HTTPException(status_code=404, detail="artifact not found")
        root = (self._task_dir(task) / "artifacts").resolve()
        candidate = (root / Path(*relative.parts)).resolve()
        if root not in candidate.parents or not candidate.is_file():
            raise HTTPException(status_code=404, detail="artifact not found")
        return candidate

    @staticmethod
    async def _stream(path: Path) -> AsyncIterator[bytes]:
        with path.open("rb") as artifact:
            while chunk := artifact.read(64 * 1024):
                yield chunk
