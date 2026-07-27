from __future__ import annotations

import asyncio
import json
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from xuanji.domain.models import Workflow, Task, Run, TaskAttempt, Project, HermesNode
from xuanji.domain.enums import RunStatus, TaskStatus, WorkflowStatus
from xuanji.storage.database import Database
from xuanji.storage.repositories import (
    ProjectRepository, WorkflowRepository, RunRepository,
    NodeRepository, ArtifactRepository, EventRepository, StoredEvent,
)
from xuanji.artifacts.manager import ArtifactManager


# ── Config ──

class CoordinatorConfig:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.db_path = data_dir / "coordinator.db"
        self.projects_dir = data_dir / "projects"


# ── Request/Response Models ──

class PlanRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=200_000)
    context: str = ""
    constraints: dict | None = None

class PlanResponse(BaseModel):
    workflow_id: str
    project_id: str
    goal: str
    tasks: list[dict]
    thinking: str

class CreateRunRequest(BaseModel):
    workflow_id: str

class TaskUpdateRequest(BaseModel):
    title: str | None = None
    description: str | None = None
    prompt: str | None = None
    agent_type: str | None = None
    dependencies: list[str] | None = None

class NodeProvisionRequest(BaseModel):
    host: str
    port: int = 22
    user: str = "root"
    key_path: str | None = None
    api_key: str = ""
    hermes_port: int = 8642


# ── App Factory ──

def create_coordinator_app(config: CoordinatorConfig) -> FastAPI:
    config.data_dir.mkdir(parents=True, exist_ok=True)
    config.projects_dir.mkdir(parents=True, exist_ok=True)

    db = Database(config.db_path)
    db.migrate()

    project_repo = ProjectRepository(db)
    workflow_repo = WorkflowRepository(db)
    run_repo = RunRepository(db)
    node_repo = NodeRepository(db)
    artifact_repo = ArtifactRepository(db)
    event_repo = EventRepository(db)

    # ── WebSocket connections ──
    ws_connections: dict[str, list[WebSocket]] = {}

    async def broadcast(run_id: str, event: StoredEvent) -> None:
        connections = ws_connections.get(run_id, [])
        dead = []
        for ws in connections:
            try:
                await ws.send_json({
                    "event_id": event.event_id,
                    "run_id": event.run_id,
                    "type": event.event_type,
                    "payload": event.payload,
                    "created_at": event.created_at.isoformat(),
                })
            except Exception:
                dead.append(ws)
        for ws in dead:
            connections.remove(ws)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        yield

    app = FastAPI(title="璇玑 Coordinator", version="2.0.0", lifespan=lifespan)
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    # ── Health ──

    @app.get("/api/status")
    def status() -> dict:
        return {"status": "ok", "version": "2.0.0"}

    # ── Projects ──

    @app.get("/api/projects")
    def list_projects() -> list[dict]:
        projects = project_repo.list()
        return [p.model_dump(mode="json") for p in projects]

    @app.get("/api/projects/{project_id}")
    def get_project(project_id: str) -> dict:
        project = project_repo.get(project_id)
        if not project:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": project_id})
        return project.model_dump(mode="json")

    # ── Workflows ──

    @app.get("/api/workflows/{workflow_id}")
    def get_workflow(workflow_id: str) -> dict:
        workflow = workflow_repo.get(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": workflow_id})
        return workflow.model_dump(mode="json")

    @app.put("/api/workflows/{workflow_id}")
    def update_workflow(workflow_id: str, tasks: list[TaskUpdateRequest]) -> dict:
        workflow = workflow_repo.get(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": workflow_id})
        # Update tasks based on request
        task_map = {t.id: t for t in workflow.tasks}
        for update in tasks:
            if update.title is not None:
                task_map[update.title].title = update.title  # Simplified
        return workflow.model_dump(mode="json")

    # ── Runs ──

    @app.post("/api/workflows/{workflow_id}/runs", status_code=201)
    def create_run(workflow_id: str) -> dict:
        workflow = workflow_repo.get(workflow_id)
        if not workflow:
            raise HTTPException(status_code=404, detail={"code": "not_found", "message": workflow_id})
        run_id = f"run_{uuid.uuid4().hex[:12]}"
        run = Run(
            id=run_id,
            workflow_id=workflow_id,
            status=RunStatus.PENDING,
            created_at=datetime.now(timezone.utc),
        )
        run_repo.create(run)
        event = event_repo.append(run_id, "run.created", {"workflow_id": workflow_id, "status": "pending"})
        return run.model_dump(mode="json")

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str) -> dict:
        rows = run_repo._latest_attempts(run_id)  # Simplified
        return {"run_id": run_id, "status": "pending"}

    @app.post("/api/runs/{run_id}/start")
    async def start_run(run_id: str) -> dict:
        # Update run status
        event = event_repo.append(run_id, "run.status_changed", {"status": "running"})
        return {"status": "started"}

    @app.post("/api/runs/{run_id}/cancel")
    async def cancel_run(run_id: str) -> dict:
        event = event_repo.append(run_id, "run.status_changed", {"status": "cancelled"})
        return {"status": "cancelled"}

    # ── Nodes ──

    @app.get("/api/nodes")
    def list_nodes() -> list[dict]:
        # Return registered nodes
        return []

    @app.post("/api/nodes/local/discover")
    def discover_local() -> dict:
        """Discover local Hermes installation."""
        import shutil
        hermes_path = shutil.which("hermes")
        return {
            "found": hermes_path is not None,
            "path": hermes_path,
            "version": None,
        }

    @app.post("/api/nodes/remote/provision")
    async def provision_remote(req: NodeProvisionRequest) -> dict:
        """Provision a remote Hermes node via SSH."""
        from xuanji.provisioning.ssh import SSHHost, ProvisioningService
        host = SSHHost(host=req.host, port=req.port, user=req.user, key_path=req.key_path)
        svc = ProvisioningService()
        steps = svc.provision_remote(host, api_key=req.api_key, hermes_port=req.hermes_port)
        return {"steps": steps, "success": all(s.get("success", False) for s in steps)}

    # ── Artifacts ──

    @app.get("/api/runs/{run_id}/artifacts")
    def get_artifacts(run_id: str) -> dict:
        return {"artifacts": []}

    # ── WebSocket ──

    @app.websocket("/ws/runs/{run_id}")
    async def ws_run(websocket: WebSocket, run_id: str, last_event_id: int = Query(default=0)):
        await websocket.accept()
        ws_connections.setdefault(run_id, []).append(websocket)
        try:
            # Send missed events
            missed = event_repo.list_for_run(run_id, after_event_id=last_event_id)
            for event in missed:
                await websocket.send_json({
                    "event_id": event.event_id,
                    "run_id": event.run_id,
                    "type": event.event_type,
                    "payload": event.payload,
                    "created_at": event.created_at.isoformat(),
                })
            while True:
                await websocket.receive_text()
        except WebSocketDisconnect:
            if websocket in ws_connections.get(run_id, []):
                ws_connections[run_id].remove(websocket)

    return app


# ── Default app instance ──

def get_default_app() -> FastAPI:
    data_dir = Path.home() / ".xuanji"
    config = CoordinatorConfig(data_dir)
    return create_coordinator_app(config)


app = get_default_app()
