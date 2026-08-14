from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient

from app import create_app

AUTH = {"Authorization": "Bearer secret"}


def _make(tmp_path: Path) -> TestClient:
    app = create_app(root=tmp_path / "tasks", token="secret", hermes_url="http://fake", hermes_token="")
    from test_node_api import FakeHermesClient

    app.state.executor.client = FakeHermesClient()
    return TestClient(app, headers=AUTH)


def _run_task(client: TestClient, key: str, verify: list[dict]) -> dict:
    created = client.post(
        "/v1/tasks",
        json={"goal": "produce output", "idempotency_key": key, "verify": verify},
    )
    assert created.status_code == 202, created.text
    completed = client.get(f"/v1/tasks/{key}")
    assert completed.status_code == 200
    return completed.json()


def test_manual_verify_marks_needs_review(tmp_path: Path) -> None:
    client = _make(tmp_path)
    record = _run_task(client, "manual-task", [{"kind": "manual", "value": "人工检查报告质量"}])
    assert record["status"] == "needs_review"
    assert record["verify_results"][0]["status"] == "manual"


def test_file_exists_verify_pass_and_fail(tmp_path: Path) -> None:
    client = _make(tmp_path)
    ok = _run_task(client, "file-ok", [{"kind": "file_exists", "value": "artifacts/hermes-output.md"}])
    assert ok["status"] == "success", ok
    missing = _run_task(client, "file-missing", [{"kind": "file_exists", "value": "nope.md"}])
    assert missing["status"] == "failed"
    assert "验证步骤未通过" in (missing["error"] or "")


def test_command_verify_runs_in_task_workdir(tmp_path: Path) -> None:
    client = _make(tmp_path)
    record = _run_task(client, "cmd-ok", [{"kind": "command", "value": "test -f artifacts/hermes-output.md"}])
    assert record["status"] == "success", record
    failing = _run_task(client, "cmd-fail", [{"kind": "command", "value": "exit 3"}])
    assert failing["status"] == "failed"


def test_sha256_verify(tmp_path: Path) -> None:
    import hashlib

    client = _make(tmp_path)
    digest = hashlib.sha256(b"Result for: produce output").hexdigest()
    record = _run_task(client, "sha-ok", [{"kind": "sha256", "value": f"artifacts/hermes-output.md#{digest}"}])
    assert record["status"] == "success", record
    bad = _run_task(client, "sha-bad", [{"kind": "sha256", "value": f"artifacts/hermes-output.md#{'0' * 64}"}])
    assert bad["status"] == "failed"


def test_verify_rejects_path_escape(tmp_path: Path) -> None:
    client = _make(tmp_path)
    record = _run_task(client, "escape", [{"kind": "file_exists", "value": "../outside.md"}])
    assert record["status"] == "failed"
