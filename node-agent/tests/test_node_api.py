from __future__ import annotations

import hashlib
import threading
from concurrent.futures import ThreadPoolExecutor
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
    second = client.post("/v1/tasks", json={"goal": "first goal", "idempotency_key": "dup"})

    assert first.json()["id"] == second.json()["id"] == "dup"
    assert second.json()["goal"] == "first goal"
    assert second.json()["status"] == "success"
    assert fake.create_calls == 1


def test_task_creation_rejects_unsafe_idempotency_keys(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)

    for key in ("../escape", "nested/task", "..", "."):
        response = client.post("/v1/tasks", json={"goal": "unsafe", "idempotency_key": key})
        assert response.status_code == 422

    assert fake.create_calls == 0
    assert not (tmp_path / "tasks" / "escape").exists()


def test_task_creation_conflicts_when_idempotency_goal_changes(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)

    first = client.post("/v1/tasks", json={"goal": "first goal", "idempotency_key": "dup-goal"})
    second = client.post("/v1/tasks", json={"goal": "different goal", "idempotency_key": "dup-goal"})

    assert first.status_code == 202
    assert second.status_code == 409
    assert second.json()["detail"]["code"] == "idempotency_conflict"
    assert fake.create_calls == 1


def test_concurrent_task_creation_starts_hermes_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, fake = make_app(tmp_path)
    barrier = threading.Barrier(2)
    task_dir = tmp_path / "tasks" / "concurrent"
    original_exists = Path.exists
    calls = 0
    calls_lock = threading.Lock()

    def synchronized_exists(path: Path) -> bool:
        nonlocal calls
        if path == task_dir:
            with calls_lock:
                calls += 1
                current_call = calls
            if current_call <= 2:
                barrier.wait(timeout=2)
                return False
        return original_exists(path)

    monkeypatch.setattr(Path, "exists", synchronized_exists)

    def create() -> int:
        with TestClient(app) as client:
            return client.post(
                "/v1/tasks",
                json={"goal": "same goal", "idempotency_key": "concurrent"},
            ).status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = list(pool.map(lambda _: create(), range(2)))

    assert statuses == [202, 202]
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


@pytest.mark.parametrize(
    ("hermes_status", "expected_status"),
    [("stopped", "cancelled"), ("cancelled", "cancelled"), ("failed", "failed")],
)
def test_cancelling_task_poll_reconciles_terminal_hermes_status(
    tmp_path: Path,
    hermes_status: str,
    expected_status: str,
) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "cancel-poll"})
    fake.stop_status = "running"
    assert client.post("/v1/tasks/cancel-poll/cancel").json()["status"] == "cancelling"
    fake.runs["cancel-poll"]["status"] = hermes_status
    if hermes_status == "failed":
        fake.runs["cancel-poll"]["error"] = "Hermes cancellation failed"

    reconciled = client.get("/v1/tasks/cancel-poll")

    assert reconciled.json()["status"] == expected_status
    if expected_status == "cancelled":
        assert reconciled.json()["error"] is None
    else:
        assert reconciled.json()["error"] == "Hermes cancellation failed"


def test_cancelling_task_poll_failure_becomes_cancel_failed(tmp_path: Path) -> None:
    app, fake = make_app(tmp_path)
    client = TestClient(app)
    client.post("/v1/tasks", json={"goal": "cancel me", "idempotency_key": "cancel-poll-error"})
    fake.stop_status = "running"
    assert client.post("/v1/tasks/cancel-poll-error/cancel").json()["status"] == "cancelling"
    fake.runs.pop("cancel-poll-error")
    fake.get_run = lambda _: (_ for _ in ()).throw(OSError("Hermes unavailable"))

    reconciled = client.get("/v1/tasks/cancel-poll-error")

    assert reconciled.json()["status"] == "cancel_failed"
    assert "Hermes unavailable" in reconciled.json()["error"]


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


def test_artifact_download_streams_opened_file_after_path_is_replaced(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    app, _ = make_app(tmp_path)
    client = TestClient(app)
    create_completed_task(client, "replaced-artifact")
    expected = b"Result for: produce output"
    path = tmp_path / "tasks" / "replaced-artifact" / "artifacts" / "hermes-output.md"
    replacement = path.with_name("replacement.md")
    replacement.write_bytes(b"X" * len(expected))
    original_artifact = app.state.executor.artifact
    captured: dict = {}

    def open_then_replace(*args):
        opened = original_artifact(*args)
        captured["opened"] = opened[0]
        replacement.replace(path)
        return opened

    monkeypatch.setattr(app.state.executor, "artifact", open_then_replace)

    response = client.get("/v1/tasks/replaced-artifact/artifacts/hermes-output.md")

    assert response.status_code == 200
    assert response.content == expected
    assert response.headers["x-artifact-size"] == str(len(expected))
    assert response.headers["x-artifact-sha256"] == hashlib.sha256(expected).hexdigest()
    assert captured["opened"].closed


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
