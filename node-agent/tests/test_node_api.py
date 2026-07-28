from __future__ import annotations

import hashlib
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app as app_module
from app import create_app


class FakeHermesClient:
    """Deterministic fake that simulates Hermes /v1/runs behavior."""

    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self.create_calls = 0
        self.stop_status = "stopped"
        self.stop_error: Exception | None = None

    def health(self) -> dict:
        return {"hermes_available": True, "models": [], "tools": []}

    def create_run(self, prompt: str, task_id: str | None = None) -> dict:
        self.create_calls += 1
        run_id = task_id or f"run_{self.create_calls}"
        self.runs[run_id] = {
            "id": run_id,
            "status": "completed",
            "output": f"Result for: {prompt}",
        }
        return self.runs[run_id]

    def get_run(self, run_id: str) -> dict:
        return self.runs.get(run_id, {"id": run_id, "status": "unknown"})

    def stop_run(self, run_id: str) -> dict:
        if self.stop_error is not None:
            raise self.stop_error
        if run_id in self.runs:
            self.runs[run_id]["status"] = self.stop_status
        return {"id": run_id, "status": self.stop_status}


def make_app(tmp_path: Path, token: str = ""):
    fake = FakeHermesClient()
    app = create_app(root=tmp_path / "tasks", token=token, hermes_url="http://fake", hermes_token="")
    app.state.executor.client = fake
    return app, fake


def create_completed_task(client: TestClient, task_id: str = "task-1") -> dict:
    created = client.post("/v1/tasks", json={"goal": "produce output", "idempotency_key": task_id})
    assert created.status_code == 202
    completed = client.get(f"/v1/tasks/{task_id}")
    assert completed.status_code == 200
    assert completed.json()["status"] == "success"
    return completed.json()


def test_bearer_authentication_protects_node_api(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path, token="secret")
    client = TestClient(app)

    assert client.get("/v1/health").status_code == 401
    assert client.get("/v1/health", headers={"Authorization": "secret"}).status_code == 401
    response = client.get("/v1/health", headers={"Authorization": "Bearer secret"})

    assert response.status_code == 200


def test_task_creates_and_completes(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path)
    client = TestClient(app)
    created = client.post("/v1/tasks", json={"goal": "test task", "idempotency_key": "t1"})

    assert created.status_code == 202
    assert created.json()["id"] == "t1"
    assert created.json()["status"] == "running"
    assert created.json()["hermes_run_id"] == "t1"
    assert client.get("/v1/tasks/t1").json()["status"] == "success"


def test_task_creation_is_idempotent_without_restarting_hermes(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)

    first = client.post("/v1/tasks", json={"goal": "first goal", "idempotency_key": "dup"})
    client.get("/v1/tasks/dup")
    second = client.post("/v1/tasks", json={"goal": "different goal", "idempotency_key": "dup"})

    assert first.json()["id"] == second.json()["id"] == "dup"
    assert second.json()["goal"] == "first goal"
    assert second.json()["status"] == "success"
    assert fake.create_calls == 1


@pytest.mark.parametrize("hermes_status", ["stopped", "cancelled"])
def test_cancel_only_marks_cancelled_after_hermes_confirmation(tmp_path: Path, hermes_status: str) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "cancel-confirmed"})
    fake.stop_status = hermes_status

    response = client.post("/v1/tasks/cancel-confirmed/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancelled"


def test_cancel_does_not_claim_success_without_hermes_confirmation(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "cancel-pending"})
    fake.stop_status = "running"

    response = client.post("/v1/tasks/cancel-pending/cancel")

    assert response.status_code == 200
    assert response.json()["status"] != "cancelled"


def test_cancel_communication_failure_is_persisted_as_cancel_failed(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "cancel-error"})
    fake.stop_error = OSError("Hermes unavailable")

    response = client.post("/v1/tasks/cancel-error/cancel")

    assert response.status_code == 200
    assert response.json()["status"] == "cancel_failed"
    assert "Hermes unavailable" in response.json()["error"]
    assert client.get("/v1/tasks/cancel-error").json()["status"] == "cancel_failed"


def test_artifact_list_matches_node_client_protocol_and_download_streams(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path, token="secret")
    client = TestClient(app)
    headers = {"Authorization": "Bearer secret"}
    client.post(
        "/v1/tasks",
        json={"goal": "produce output", "idempotency_key": "artifact-task"},
        headers=headers,
    )
    client.get("/v1/tasks/artifact-task", headers=headers)

    listed = client.get("/v1/tasks/artifact-task/artifacts", headers=headers)

    assert listed.status_code == 200
    artifact = listed.json()["artifacts"][0]
    assert artifact == {
        "path": "hermes-output.md",
        "size": len(b"Result for: produce output"),
        "sha256": hashlib.sha256(b"Result for: produce output").hexdigest(),
    }

    with client.stream(
        "GET",
        f"/v1/tasks/artifact-task/artifacts/{artifact['path']}",
        headers=headers,
    ) as downloaded:
        body = b"".join(downloaded.iter_bytes())
        assert downloaded.status_code == 200
        assert downloaded.headers["content-length"] == str(artifact["size"])
        assert downloaded.headers["x-artifact-size"] == str(artifact["size"])
        assert downloaded.headers["x-artifact-sha256"] == artifact["sha256"]

    assert body == b"Result for: produce output"
    assert client.get(f"/v1/tasks/artifact-task/artifacts/{artifact['path']}").status_code == 401


def test_artifact_download_rejects_parent_traversal_and_absolute_paths(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path)
    client = TestClient(app)
    create_completed_task(client, "safe-task")

    traversal = client.get("/v1/tasks/safe-task/artifacts/%2E%2E%2Ftask.json")
    absolute = client.get("/v1/tasks/safe-task/artifacts/%2Fetc%2Fpasswd")

    assert traversal.status_code in {400, 404}
    assert absolute.status_code in {400, 404}
    assert traversal.content != (tmp_path / "tasks" / "safe-task" / "task.json").read_bytes()


def test_artifact_download_rejects_symlink_escape(tmp_path: Path) -> None:
    app, _ = make_app(tmp_path)
    client = TestClient(app)
    create_completed_task(client, "symlink-task")
    secret = tmp_path / "outside.txt"
    secret.write_text("outside secret", encoding="utf-8")
    artifacts_dir = tmp_path / "tasks" / "symlink-task" / "artifacts"
    (artifacts_dir / "outside-link.txt").symlink_to(secret)

    response = client.get("/v1/tasks/symlink-task/artifacts/outside-link.txt")

    assert response.status_code in {400, 404}
    assert response.content != secret.read_bytes()


def test_node_agent_main_binds_loopback_by_default(monkeypatch: pytest.MonkeyPatch) -> None:
    called: dict = {}
    monkeypatch.delenv("XUANJI_NODE_HOST", raising=False)
    monkeypatch.setattr("uvicorn.run", lambda target, **kwargs: called.update({"target": target, **kwargs}))

    app_module.main()

    assert called["host"] == "127.0.0.1"
    assert called["target"] is app_module.app
