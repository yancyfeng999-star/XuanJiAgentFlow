from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app


def make_fake_hermes(tmp_path: Path, sleep: bool = False) -> Path:
    script = tmp_path / "hermes"
    body = "#!/bin/sh\n"
    if sleep:
        body += "sleep 20\n"
    else:
        body += "mkdir -p artifacts\necho test-output > artifacts/result.txt\necho final-response\n"
    script.write_text(body)
    script.chmod(0o755)
    return script


def test_health_requires_token(tmp_path: Path):
    app = create_app(tmp_path / "tasks", token="secret", hermes_bin=str(make_fake_hermes(tmp_path)))
    client = TestClient(app)
    assert client.get("/v1/health").status_code == 401
    response = client.get("/v1/health", headers={"Authorization": "Bearer secret"})
    assert response.status_code == 200
    assert response.json()["hermes_available"] is True


def test_task_runs_and_lists_artifact(tmp_path: Path):
    app = create_app(tmp_path / "tasks", hermes_bin=str(make_fake_hermes(tmp_path)))
    with TestClient(app) as client:
        created = client.post("/v1/tasks", json={"goal": "write result", "idempotency_key": "task_demo"})
        assert created.status_code == 202

        import time
        state = {"status": "queued"}
        for _ in range(50):
            state = client.get("/v1/tasks/task_demo").json()
            if state["status"] in {"success", "failed"}:
                break
            time.sleep(0.02)

        assert state["status"] == "success"
        logs = client.get("/v1/tasks/task_demo/logs").json()["events"]
        assert any("final-response" in event["message"] for event in logs)
        artifacts = client.get("/v1/tasks/task_demo/artifacts").json()["artifacts"]
        assert artifacts[0]["path"] == "artifacts/result.txt"
        assert len(artifacts[0]["sha256"]) == 64


def test_idempotency_returns_existing_task(tmp_path: Path):
    app = create_app(tmp_path / "tasks", hermes_bin=str(make_fake_hermes(tmp_path)))
    client = TestClient(app)
    first = client.post("/v1/tasks", json={"goal": "one", "idempotency_key": "same"})
    second = client.post("/v1/tasks", json={"goal": "two", "idempotency_key": "same"})
    assert first.json()["id"] == second.json()["id"] == "same"


def test_cancel_terminates_process(tmp_path: Path):
    app = create_app(tmp_path / "tasks", hermes_bin=str(make_fake_hermes(tmp_path, sleep=True)))
    with TestClient(app) as client:
        client.post("/v1/tasks", json={"goal": "long task", "idempotency_key": "long"})
        cancelled = client.post("/v1/tasks/long/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
