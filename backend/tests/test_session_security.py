from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.test_api import MockPlanner, create_node, create_project, plan_workflow, review_workflow
from xuanji.api.app import CoordinatorConfig, create_coordinator_app
from xuanji.credentials import InMemoryCredentialStore, LocalCredentialStore, migrate_credentials

SESSION = "test-session-token"


@pytest.fixture
def secure_client(tmp_path: Path):
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data", poll_interval=0.001, session_token=SESSION),
        planner=MockPlanner(),
    )
    with TestClient(app, headers={"X-Xuanji-Session": SESSION}) as client:
        yield client


def _make_run(client: TestClient) -> str:
    project = create_project(client)
    create_node(client)
    # 无真实节点时 diagnose 会把节点标记离线；恢复为在线以满足执行就绪门禁
    client.patch("/api/nodes/node-1", json={"status": "online"})
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    return run["id"]


def test_http_api_rejects_query_param_session_token(secure_client: TestClient) -> None:
    client = secure_client
    response = client.get("/api/projects", headers={"X-Xuanji-Session": ""})
    assert response.status_code == 401
    response = client.get(f"/api/projects?session_token={SESSION}", headers={"X-Xuanji-Session": ""})
    assert response.status_code == 401
    assert client.get("/api/projects").status_code == 200


def test_ws_ticket_lifecycle(secure_client: TestClient) -> None:
    client = secure_client
    run_id = _make_run(client)

    response = client.post("/api/session/ws-tickets", json={"run_id": run_id})
    assert response.status_code == 201, response.text
    ticket = response.json()["ticket"]

    with client.websocket_connect(f"/ws/runs/{run_id}?ticket={ticket}") as ws:
        pass

    # 重放同一票据必须失败（单次消费）
    with pytest.raises(WebSocketDisconnect) as replay:
        with client.websocket_connect(f"/ws/runs/{run_id}?ticket={ticket}"):
            pass
    assert replay.value.code == 4401


def test_ws_ticket_bound_to_run(secure_client: TestClient) -> None:
    client = secure_client
    run_id = _make_run(client)
    other_run = _make_run(client)
    ticket = client.post("/api/session/ws-tickets", json={"run_id": run_id}).json()["ticket"]
    with pytest.raises(WebSocketDisconnect) as mismatch:
        with client.websocket_connect(f"/ws/runs/{other_run}?ticket={ticket}"):
            pass
    assert mismatch.value.code == 4401


def test_ws_without_ticket_rejected(secure_client: TestClient) -> None:
    client = secure_client
    run_id = _make_run(client)
    with pytest.raises(WebSocketDisconnect) as missing:
        with client.websocket_connect(f"/ws/runs/{run_id}"):
            pass
    assert missing.value.code == 4401
    with pytest.raises(WebSocketDisconnect) as legacy:
        with client.websocket_connect(f"/ws/runs/{run_id}?session_token={SESSION}"):
            pass
    assert legacy.value.code == 4401


def test_ws_ticket_expires(secure_client: TestClient) -> None:
    client = secure_client
    run_id = _make_run(client)
    app = client.app
    store = app.state.services.session_tickets
    ticket = client.post("/api/session/ws-tickets", json={"run_id": run_id}).json()["ticket"]
    bound_run, expires_at = store._tickets[ticket]
    store._tickets[ticket] = (bound_run, expires_at - 60)
    with pytest.raises(WebSocketDisconnect) as expired:
        with client.websocket_connect(f"/ws/runs/{run_id}?ticket={ticket}"):
            pass
    assert expired.value.code == 4401


def test_ws_ticket_requires_session_header(secure_client: TestClient) -> None:
    client = secure_client
    run_id = _make_run(client)
    response = client.post(
        "/api/session/ws-tickets",
        json={"run_id": run_id},
        headers={"X-Xuanji-Session": ""},
    )
    assert response.status_code == 401


def test_credential_migration_verifies_readback_before_removing_plaintext(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    legacy = LocalCredentialStore(path)
    legacy.set("planner.key", "sk-test")

    target = InMemoryCredentialStore()
    report = migrate_credentials(legacy, target)
    assert report["migrated"] is True
    assert report["migrated_keys"] == 1
    assert target.get("planner.key") == "sk-test"
    assert not path.exists()
    backup = tmp_path / "credentials.json.migrated"
    assert backup.exists()
    assert oct(backup.stat().st_mode & 0o777) == "0o600"


def test_credential_migration_failure_preserves_plaintext(tmp_path: Path) -> None:
    path = tmp_path / "credentials.json"
    legacy = LocalCredentialStore(path)
    legacy.set("planner.key", "sk-test")

    class FailingStore:
        def get(self, key):
            return None

        def set(self, key, value):
            raise RuntimeError("keychain locked")

        def delete(self, key):
            pass

    report = migrate_credentials(legacy, FailingStore())
    assert report["migrated"] is False
    assert path.exists()
    assert legacy.get("planner.key") == "sk-test"
