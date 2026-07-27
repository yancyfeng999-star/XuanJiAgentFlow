from pathlib import Path
from unittest.mock import MagicMock

import httpx
from fastapi.testclient import TestClient

from app import create_app
from executor import HermesNodeClient, TaskRecord


class FakeHermesClient:
    """Deterministic fake that simulates Hermes /v1/runs behavior."""

    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self._counter = 0

    def health(self) -> dict:
        return {"hermes_available": True, "models": [], "tools": []}

    def create_run(self, prompt: str, task_id: str | None = None) -> dict:
        run_id = task_id or f"run_{self._counter}"
        self._counter += 1
        self.runs[run_id] = {"id": run_id, "status": "completed", "output": f"Result for: {prompt}"}
        return self.runs[run_id]

    def get_run(self, run_id: str) -> dict:
        return self.runs.get(run_id, {"id": run_id, "status": "unknown"})

    def stop_run(self, run_id: str) -> dict:
        if run_id in self.runs:
            self.runs[run_id]["status"] = "stopped"
        return {"id": run_id, "status": "stopped"}


def make_app(tmp_path: Path, token: str = ""):
    fake = FakeHermesClient()
    client = HermesNodeClient.__new__(HermesNodeClient)
    client.__dict__.update({"base_url": "http://fake", "token": "", "timeout": 10})
    # Monkey-patch the client methods
    original_create = create_app
    app = create_app(root=tmp_path / "tasks", token=token, hermes_url="http://fake", hermes_token="")
    # Replace the executor's client with our fake
    app.state.executor.client = fake
    return app, fake


def test_health_requires_token(tmp_path: Path):
    app, _ = make_app(tmp_path, token="secret")
    client = TestClient(app)
    assert client.get("/v1/health").status_code == 401
    response = client.get("/v1/health", headers={"Authorization": "Bearer secret"})
    assert response.status_code == 200


def test_task_creates_and_completes(tmp_path: Path):
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    created = client.post("/v1/tasks", json={"goal": "test task", "idempotency_key": "t1"})
    assert created.status_code == 202
    data = created.json()
    assert data["id"] == "t1"
    assert data["status"] == "running"
    assert data["hermes_run_id"] is not None

    # Poll should transition to success
    state = client.get("/v1/tasks/t1").json()
    assert state["status"] == "success"


def test_cancel_stops_hermes_run(tmp_path: Path):
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "t2"})
    cancelled = client.post("/v1/tasks/t2/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"


def test_idempotency(tmp_path: Path):
    app, _ = make_app(tmp_path)
    client = TestClient(app)
    first = client.post("/v1/tasks", json={"goal": "a", "idempotency_key": "dup"})
    second = client.post("/v1/tasks", json={"goal": "b", "idempotency_key": "dup"})
    assert first.json()["id"] == second.json()["id"]


def test_artifacts_captured(tmp_path: Path):
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "produce output", "idempotency_key": "t3"})
    client.get("/v1/tasks/t3")  # trigger poll
    artifacts = client.get("/v1/tasks/t3/artifacts").json()["artifacts"]
    assert len(artifacts) >= 1
    assert artifacts[0]["sha256"] is not None
