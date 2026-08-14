from __future__ import annotations

import asyncio
import hashlib
import sqlite3
import time
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from tests.fakes.fake_node import FakeNode, FakeNodeMode
from xuanji.api.app import CoordinatorConfig, create_coordinator_app
from xuanji.api.errors import install_error_handlers
from xuanji.domain.enums import WorkflowStatus
from xuanji.domain.models import Task, Workflow
from xuanji.nodes import NodeClient, NodeHealth
from xuanji.provisioning import ProvisioningService


class MockPlanner:
    async def plan(
        self,
        project_id: str,
        goal: str,
        context: str,
        constraints: dict,
    ) -> Workflow:
        workflow_id = f"workflow-{project_id}-{time.time_ns()}"
        return Workflow(
            id=workflow_id,
            project_id=project_id,
            version=1,
            goal=goal,
            status=WorkflowStatus.DRAFT,
            planner_provider="mock",
            planner_model="mock-model",
            tasks=[
                Task(
                    id="research",
                    workflow_id=workflow_id,
                    title="Research",
                    prompt=f"{goal}\n{context}",
                ),
                Task(
                    id="write",
                    workflow_id=workflow_id,
                    title="Write",
                    prompt="Write the result",
                    dependencies=["research"],
                ),
            ],
        )


@pytest.fixture
def api_harness(tmp_path: Path):
    fake = FakeNode(FakeNodeMode.SUCCESS, token="node-secret")
    transport_client = httpx.AsyncClient(
        transport=fake.transport(),
        base_url="http://node-1.test",
    )
    node_client = NodeClient(
        "http://node-1.test",
        fake.token,
        client=transport_client,
    )
    def node_client_factory(base_url: str, token: str) -> NodeClient:
        return NodeClient(
            base_url,
            token,
            client=httpx.AsyncClient(
                transport=fake.transport(),
                base_url=base_url,
            ),
        )

    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data", poll_interval=0.001),
        planner=MockPlanner(),
        node_clients={"node-1": node_client},
        node_client_factory=node_client_factory,
    )
    with TestClient(app) as client:
        yield client, app, fake, transport_client
    fake.close()


def create_project(client: TestClient, name: str = "Demo") -> dict:
    response = client.post("/api/projects", json={"name": name})
    assert response.status_code == 201, response.text
    return response.json()


def plan_workflow(client: TestClient, project_id: str) -> dict:
    response = client.post(
        f"/api/projects/{project_id}/plan",
        json={"goal": "Build a verified report", "context": "Use local files"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def review_workflow(client: TestClient, workflow_id: str) -> dict:
    prepared = client.post(f"/api/workflows/{workflow_id}/review/prepare")
    assert prepared.status_code == 200, prepared.text
    snapshot = prepared.json()
    response = client.post(
        f"/api/workflows/{workflow_id}/review",
        json={
            "snapshot_hash": snapshot["snapshot_hash"],
            "acknowledged_warnings": sorted({w["code"] for w in snapshot["warnings"]}),
        },
    )
    assert response.status_code == 200, response.text
    return response.json()


def create_node(client: TestClient) -> dict:
    response = client.post(
        "/api/nodes",
        json={
            "id": "node-1",
            "name": "Fake Node",
            "kind": "local",
            "api_url": "http://node-1.test",
            "status": "online",
            "capabilities_json": {
                "models": ["fake-model"],
                "tools": ["terminal"],
                "tags": ["fake"],
            },
            "max_concurrency": 2,
            "credential": "node-secret",
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def create_reviewed_run(client: TestClient) -> tuple[dict, dict, dict]:
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert response.status_code == 201, response.text
    return project, workflow, response.json()


def wait_for_run(client: TestClient, run_id: str, expected: set[str]) -> dict:
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        response = client.get(f"/api/runs/{run_id}")
        assert response.status_code == 200
        payload = response.json()
        if payload["status"] in expected:
            return payload
        time.sleep(0.01)
    pytest.fail(f"run {run_id} did not reach {expected}")


def assert_error(response, status: int, code: str) -> dict:
    assert response.status_code == status, response.text
    payload = response.json()
    assert set(payload) == {"error"}
    assert payload["error"]["code"] == code
    assert isinstance(payload["error"]["message"], str)
    assert isinstance(payload["error"]["details"], dict)
    return payload["error"]


def test_lifespan_initializes_and_closes_resources(api_harness) -> None:
    client, app, _, transport_client = api_harness
    assert client.get("/api/status").json() == {"status": "ok", "version": "3.0.0"}
    database = app.state.services.database
    assert database.connection.execute("SELECT 1").fetchone()[0] == 1
    assert not transport_client.is_closed

    client.__exit__ = client.__exit__  # keep references alive until fixture teardown


def test_lifespan_resources_are_closed_after_context(tmp_path: Path) -> None:
    fake = FakeNode()
    transport_client = httpx.AsyncClient(transport=fake.transport(), base_url="http://node.test")
    node_client = NodeClient("http://node.test", fake.token, client=transport_client)
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data"),
        planner=MockPlanner(),
        node_clients={"node": node_client},
    )
    with TestClient(app):
        database = app.state.services.database
    with pytest.raises(sqlite3.ProgrammingError):
        database.connection.execute("SELECT 1")
    assert transport_client.is_closed
    fake.close()


def test_project_accepts_user_selected_external_root(api_harness, tmp_path: Path) -> None:
    client, _, _, _ = api_harness
    external = tmp_path / "user-selected-project"
    response = client.post(
        "/api/projects",
        json={"name": "External", "root_path": str(external)},
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert Path(body["root_path"]) == external.resolve()
    assert (external / "workflow").is_dir()
    assert (external / "project.json").is_file()


def test_project_crud_and_structured_not_found(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    assert project["root_path"].endswith(project["id"])
    assert client.get("/api/projects").json() == [project]

    updated = client.patch(
        f"/api/projects/{project['id']}",
        json={"name": "Renamed"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed"

    project_root = Path(project["root_path"])
    deleted = client.delete(f"/api/projects/{project['id']}")
    assert deleted.status_code == 200
    assert deleted.json() == {
        "deleted": True,
        "artifacts_retained": True,
        "root_path": str(project_root),
    }
    assert project_root.is_dir()
    assert_error(client.get(f"/api/projects/{project['id']}"), 404, "project_not_found")


def test_project_can_plan_twice_with_reused_task_ids_and_read_both_versions(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    first = plan_workflow(client, project["id"])
    second = plan_workflow(client, project["id"])

    assert second["version"] == 2
    assert client.get(f"/api/projects/{project['id']}/workflow").json() == second
    assert client.get(f"/api/workflows/{first['id']}").json() == first
    assert client.get(f"/api/workflows/{second['id']}").json() == second


def test_active_workflow_is_null_before_planning(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)

    response = client.get(f"/api/projects/{project['id']}/workflow")

    assert response.status_code == 200
    assert response.json() is None


def test_active_workflow_rejects_missing_project(api_harness) -> None:
    client, _, _, _ = api_harness

    assert_error(client.get("/api/projects/missing/workflow"), 404, "project_not_found")


def test_validation_errors_use_unified_envelope(api_harness) -> None:
    client, _, _, _ = api_harness
    error = assert_error(client.post("/api/projects", json={"name": ""}), 422, "validation_error")
    assert isinstance(error["details"], dict)
    assert isinstance(error["details"]["errors"], list)


@pytest.mark.parametrize(
    ("path", "method", "payload", "secret"),
    [
        ("/api/nodes", "post", {"id": "node-secret-test", "kind": "local", "api_url": "http://node.test", "credential": "token-never-echo"}, "token-never-echo"),
        ("/api/planner/config", "put", {"base_url": "https://planner.test/v1", "credential_key": "planner.primary", "credential": "api-key-never-echo"}, "api-key-never-echo"),
    ],
)
def test_validation_errors_never_echo_secret_input(
    api_harness,
    path: str,
    method: str,
    payload: dict,
    secret: str,
) -> None:
    client, _, _, _ = api_harness

    response = getattr(client, method)(path, json=payload)

    error = assert_error(response, 422, "validation_error")
    assert secret not in response.text
    assert all("input" not in detail for detail in error["details"]["errors"])


def test_plan_edit_validate_review_and_freeze(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    assert workflow["status"] == "draft"

    tasks = workflow["tasks"]
    tasks[0]["title"] = "Investigate"
    response = client.put(
        f"/api/workflows/{workflow['id']}",
        json={"tasks": tasks, "graph_json": {"layout": "manual"}},
    )
    assert response.status_code == 200, response.text
    assert response.json()["tasks"][0]["title"] == "Investigate"
    assert client.post(f"/api/workflows/{workflow['id']}/validate").json() == {
        "valid": True,
        "topological_order": ["research", "write"],
    }

    reviewed = review_workflow(client, workflow["id"])
    assert reviewed["status"] == "reviewed"
    assert_error(
        client.put(f"/api/workflows/{workflow['id']}", json={"tasks": tasks}),
        409,
        "workflow_frozen",
    )


def test_workflow_cycle_returns_structured_error(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    tasks = workflow["tasks"]
    tasks[0]["dependencies"] = ["write"]
    error = assert_error(
        client.put(f"/api/workflows/{workflow['id']}", json={"tasks": tasks}),
        422,
        "workflow_invalid",
    )
    assert "环" in str(error["details"])


def test_workflow_validation_errors_never_echo_secret_prompt(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    secret = "prompt-secret-must-never-leak"
    tasks = workflow["tasks"]
    tasks[0]["prompt"] = secret
    tasks[0]["dependencies"] = ["write"]
    response = client.put(f"/api/workflows/{workflow['id']}", json={"tasks": tasks})
    error = assert_error(response, 422, "workflow_invalid")
    assert secret not in response.text
    assert "input" not in str(error["details"])


def test_run_requires_review_and_start_is_async_202(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    assert_error(
        client.post(f"/api/workflows/{workflow['id']}/runs"),
        409,
        "workflow_not_reviewed",
    )
    review_workflow(client, workflow["id"])
    create_node(client)
    run_response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert run_response.status_code == 201
    run_id = run_response.json()["id"]

    started = client.post(f"/api/runs/{run_id}/start")
    assert started.status_code == 202
    assert started.json() == {"id": run_id, "status": "accepted"}
    completed = wait_for_run(client, run_id, {"success"})
    assert completed["status"] == "success"
    assert {attempt["task_id"] for attempt in completed["attempts"]} == {"research", "write"}


def test_run_pause_resume_cancel_retry_and_skip_routes(api_harness) -> None:
    client, app, fake, _ = api_harness
    create_node(client)
    _, workflow, run = create_reviewed_run(client)
    run_id = run["id"]

    assert client.post(f"/api/runs/{run_id}/start").status_code == 202
    wait_for_run(client, run_id, {"running", "success"})
    pause = client.post(f"/api/runs/{run_id}/pause")
    assert pause.status_code == 200
    if pause.json()["status"] == "paused":
        assert client.post(f"/api/runs/{run_id}/resume").json()["status"] in {"running", "success"}

    pending_response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert pending_response.status_code == 201
    pending_run = pending_response.json()
    skipped = client.post(f"/api/runs/{pending_run['id']}/tasks/research/skip")
    assert skipped.status_code == 200
    assert skipped.json()["attempts"][0]["status"] == "skipped"

    fake.mode = FakeNodeMode.FAILURE
    failed_response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert failed_response.status_code == 201
    failed_run = failed_response.json()
    assert client.post(f"/api/runs/{failed_run['id']}/start").status_code == 202
    deadline = time.monotonic() + 2
    while time.monotonic() < deadline:
        failed_state = client.get(f"/api/runs/{failed_run['id']}").json()
        research_attempt = next(
            attempt for attempt in failed_state["attempts"] if attempt["task_id"] == "research"
        )
        if research_attempt["status"] == "failed":
            break
        time.sleep(0.01)
    else:
        pytest.fail("research attempt did not fail before automatic retry delay")
    fake.mode = FakeNodeMode.SUCCESS
    retried = client.post(f"/api/runs/{failed_run['id']}/tasks/research/retry")
    assert retried.status_code == 200, retried.text
    assert retried.json()["attempt"] == 2

    cancel_response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert cancel_response.status_code == 201
    cancel_run = cancel_response.json()
    cancelled = client.post(f"/api/runs/{cancel_run['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"
    assert not app.state.services.execution._loops.get(cancel_run["id"])


def test_create_node_is_online_when_agent_works_even_if_hostname_does_not_resolve(api_harness) -> None:
    client, _, _, _ = api_harness
    created = client.post(
        "/api/nodes",
        json={
            "id": "node-unresolvable",
            "name": "Unresolvable Host",
            "kind": "local",
            "api_url": "http://no-such-host.invalid",
            "capabilities_json": {"models": ["fake-model"], "tools": ["terminal"], "tags": ["fake"]},
            "max_concurrency": 1,
            "credential": "node-secret",
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["status"] == "online"


def test_node_crud_diagnose_and_credentials_never_echo(api_harness) -> None:
    client, _, _, _ = api_harness
    node = create_node(client)
    assert node["credential_configured"] is True
    assert "credential" not in node
    assert "node-secret" not in str(node)
    assert client.get("/api/nodes").json() == [node]

    diagnosed = client.post("/api/nodes/node-1/diagnose")
    assert diagnosed.status_code == 200, diagnosed.text
    assert diagnosed.json()["health"]["status"] == "ok"
    assert diagnosed.json()["capabilities"]["models"] == ["fake-model"]
    persisted = client.get("/api/nodes").json()[0]
    assert persisted["status"] == "online"
    assert persisted["capabilities_json"]["models"] == ["fake-model"]
    assert persisted["last_seen_at"] is not None

    updated = client.patch(
        "/api/nodes/node-1",
        json={"name": "Renamed Node", "credential": "replacement-secret"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Renamed Node"
    assert "replacement-secret" not in updated.text
    assert updated.json()["credential_configured"] is True
    assert client.delete("/api/nodes/node-1").status_code == 204
    assert_error(client.post("/api/nodes/node-1/diagnose"), 404, "node_not_found")


def test_node_credential_state_is_available_without_leaking_token(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)

    response = client.get("/api/nodes")

    assert response.status_code == 200
    assert response.json()[0]["credential_configured"] is True
    assert "node-secret" not in response.text


def test_node_deletion_removes_client_and_credential(api_harness) -> None:
    class ProtectedClient:
        def __init__(self) -> None:
            self.closed = False

        async def close(self) -> None:
            self.closed = True

    client, app, _, _ = api_harness
    create_node(client)
    protected_client = ProtectedClient()
    app.state.services.node_clients["node-1"] = protected_client
    app.state.services.execution.node_clients["node-1"] = protected_client

    assert client.delete("/api/nodes/node-1").status_code == 204
    assert app.state.services.nodes.get("node-1") is None
    assert "node-1" not in app.state.services.node_clients
    assert "node-1" not in app.state.services.execution.node_clients
    assert protected_client.closed is True


@pytest.mark.parametrize("node_id", [".", ".."])
def test_node_id_rejects_dot_path_segments_without_persisting(api_harness, node_id: str) -> None:
    client, app, _, _ = api_harness

    response = client.post(
        "/api/nodes",
        json={
            "id": node_id,
            "name": "Unsafe Node",
            "kind": "local",
            "api_url": "http://node.test",
        },
    )

    assert_error(response, 422, "validation_error")
    assert app.state.services.nodes.get(node_id) is None
    assert all(node["id"] != node_id for node in client.get("/api/nodes").json())


def test_node_id_must_be_a_safe_path_segment(api_harness) -> None:
    client, _, _, _ = api_harness
    error = assert_error(
        client.post(
            "/api/nodes",
            json={
                "id": "team/node",
                "name": "Unsafe Node",
                "kind": "local",
                "api_url": "http://node.test",
                "credential": "node-secret",
            },
        ),
        422,
        "validation_error",
    )
    assert isinstance(error["details"]["errors"], list)


def test_security_routes_are_removed(api_harness) -> None:
    client, _, _, _ = api_harness
    assert client.get("/api/security/status").status_code == 404


def test_artifact_list_and_safe_download(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    project, _, run = create_reviewed_run(client)
    assert client.post(f"/api/runs/{run['id']}/start").status_code == 202
    wait_for_run(client, run["id"], {"success"})

    listed = client.get(f"/api/runs/{run['id']}/artifacts")
    assert listed.status_code == 200
    artifacts = listed.json()["artifacts"]
    assert len(artifacts) == 2
    artifact = artifacts[0]
    downloaded = client.get(
        f"/api/runs/{run['id']}/artifacts/download",
        params={"path": artifact["relative_path"]},
    )
    assert downloaded.status_code == 200
    assert len(downloaded.content) == artifact["size"]
    assert_error(
        client.get(
            f"/api/runs/{run['id']}/artifacts/download",
            params={"path": "../../vault.json"},
        ),
        404,
        "artifact_not_found",
    )
    assert Path(project["root_path"]).is_dir()


def test_websocket_replays_then_streams_strictly_increasing_events(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    _, _, run = create_reviewed_run(client)
    run_id = run["id"]

    with client.websocket_connect(f"/ws/runs/{run_id}?last_event_id=0") as websocket:
        created = websocket.receive_json()
        assert created["type"] == "run.created"
        assert created["event_id"] > 0
        assert client.post(f"/api/runs/{run_id}/start").status_code == 202
        streamed = websocket.receive_json()
        assert streamed["event_id"] > created["event_id"]

    with client.websocket_connect(
        f"/ws/runs/{run_id}?last_event_id={created['event_id']}"
    ) as websocket:
        replayed = websocket.receive_json()
        assert replayed["event_id"] == streamed["event_id"]


def test_missing_run_actions_are_structured(api_harness) -> None:
    client, _, _, _ = api_harness
    for action in ("start", "pause", "resume", "cancel"):
        assert_error(
            client.post(f"/api/runs/missing/{action}"),
            404,
            "run_not_found",
        )


def test_default_app_reports_planner_not_configured_and_persists_redacted_config(
    tmp_path: Path,
) -> None:
    built: list[dict[str, str]] = []

    def planner_factory(config: dict[str, str], _vault) -> MockPlanner:
        built.append(config)
        return MockPlanner()

    config = CoordinatorConfig(data_dir=tmp_path / "data")
    app = create_coordinator_app(config, planner_factory=planner_factory)
    with TestClient(app) as client:
        project = create_project(client)
        error = assert_error(
            client.post(f"/api/projects/{project['id']}/plan", json={"goal": "goal"}),
            503,
            "planner_not_configured",
        )
        assert error["message"] == "思考模型尚未配置，请先前往“思考模型”完成配置"
        assert error["details"] == {"configured": False}
        secret = "planner-secret-never-echo"
        configured = client.put(
            "/api/planner/config",
            json={
                "base_url": "https://planner.test/v1",
                "model": "planner-model",
                "credential_key": "planner.primary",
                "credential": secret,
            },
        )
        assert configured.status_code == 200, configured.text
        assert secret not in configured.text
        assert configured.json() == {
            "base_url": "https://planner.test/v1",
            "model": "planner-model",
            "credential_key": "planner.primary",
            "credential_configured": True,
        }
        assert secret not in client.get("/api/planner/config").text
        assert client.post(
            f"/api/projects/{project['id']}/plan",
            json={"goal": "configured"},
        ).status_code == 201

    restarted = create_coordinator_app(config, planner_factory=planner_factory)
    with TestClient(restarted) as client:
        saved = client.get("/api/planner/config")
        assert saved.status_code == 200
        assert saved.json()["credential_configured"] is True
        assert restarted.state.services.planner is not None
    assert built[-1] == {
        "base_url": "https://planner.test/v1",
        "model": "planner-model",
        "credential_key": "planner.primary",
    }


class RecordingNodeClient:
    def __init__(self, base_url: str, token: str) -> None:
        self.base_url = base_url
        self.token = token
        self.closed = False

    async def close(self) -> None:
        self.closed = True

    async def health(self) -> NodeHealth:
        return NodeHealth(status="ok")

    async def capabilities(self) -> dict[str, list[str]]:
        return {"models": ["recording"], "tools": [], "tags": []}


class OfflineProvisioner(ProvisioningService):
    def provision_remote(self, host, api_key: str = "", hermes_port: int = 8642) -> list[dict]:
        return [
            {"step": "ssh_connect", "success": True},
            {"step": "verify_api_server", "online": False},
        ]


class RecordingProvisioner(ProvisioningService):
    def __init__(self) -> None:
        self.calls: list[tuple[Any, str, int]] = []

    def provision_remote(self, host, api_key: str = "", hermes_port: int = 8642) -> list[dict]:
        self.calls.append((host, api_key, hermes_port))
        return [{"step": "ssh_connect", "success": True}]


def test_node_client_lifecycle_restart_diagnostic_and_remote_provision(tmp_path: Path) -> None:
    created_clients: list[RecordingNodeClient] = []
    provisioner = RecordingProvisioner()

    def client_factory(base_url: str, token: str) -> RecordingNodeClient:
        client = RecordingNodeClient(base_url, token)
        created_clients.append(client)
        return client

    config = CoordinatorConfig(data_dir=tmp_path / "data")
    app = create_coordinator_app(
        config,
        planner=MockPlanner(),
        node_client_factory=client_factory,
        provisioning=provisioner,
    )
    with TestClient(app) as client:
        created = client.post(
            "/api/nodes",
            json={
                "id": "remote-1",
                "name": "Remote",
                "kind": "remote",
                "api_url": "http://remote.test:8642",
                "ssh_host": "remote.test",
                "ssh_port": 2222,
                "ssh_user": "runner",
                "status": "online",
                "credential": "first-token",
            },
        )
        assert created.status_code == 201, created.text
        first = created_clients[-1]
        assert app.state.services.node_clients["remote-1"] is first
        assert app.state.services.execution.node_clients["remote-1"] is first

        updated = client.patch(
            "/api/nodes/remote-1",
            json={"api_url": "http://remote.test:9000", "credential": "second-token"},
        )
        assert updated.status_code == 200, updated.text
        second = created_clients[-1]
        assert first.closed
        assert second is app.state.services.node_clients["remote-1"]
        assert second is app.state.services.execution.node_clients["remote-1"]

        provisioned = client.post("/api/nodes/remote-1/provision", json={"hermes_port": 9000})
        assert provisioned.status_code == 200, provisioned.text
        assert provisioned.json() == {
            "node_id": "remote-1",
            "completed": False,
            "steps": [{"step": "ssh_connect", "success": True}],
        }
        assert provisioner.calls[-1][1:] == ("second-token", 9000)

    restarted = create_coordinator_app(config, node_client_factory=client_factory)
    with TestClient(restarted) as client:
        assert client.get("/api/nodes").json()[0]["id"] == "remote-1"
        assert "remote-1" in restarted.state.services.node_clients
        active = restarted.state.services.node_clients["remote-1"]
        assert active is restarted.state.services.execution.node_clients["remote-1"]
        deleted = client.delete("/api/nodes/remote-1")
        assert deleted.status_code == 204
        assert active.closed
        assert "remote-1" not in restarted.state.services.execution.node_clients


def test_startup_registers_existing_projects_and_project_fk_conflict_is_409(tmp_path: Path) -> None:
    config = CoordinatorConfig(data_dir=tmp_path / "data")
    app = create_coordinator_app(config, planner=MockPlanner())
    with TestClient(app) as client:
        project = create_project(client)
        workflow = plan_workflow(client, project["id"])
        review_workflow(client, workflow["id"])
        create_node(client)
        # 无真实节点时 diagnose 会把节点标记离线；恢复为在线以满足执行就绪门禁
        assert client.patch("/api/nodes/node-1", json={"status": "online"}).status_code == 200
        assert client.post(f"/api/workflows/{workflow['id']}/runs").status_code == 201
        conflict = assert_error(client.delete(f"/api/projects/{project['id']}"), 409, "resource_in_use")
        assert conflict["details"] == {"resource": "project", "id": project["id"]}

    restarted = create_coordinator_app(config, planner=MockPlanner())
    with TestClient(restarted):
        resolved = restarted.state.services.artifacts.resolve_project_path(project["id"], "project.json")
        assert resolved.is_file()


def test_artifact_download_rejects_same_size_hash_tampering(api_harness) -> None:
    client, app, _, _ = api_harness
    create_node(client)
    _, _, run = create_reviewed_run(client)
    client.post(f"/api/runs/{run['id']}/start")
    wait_for_run(client, run["id"], {"success"})
    artifact = client.get(f"/api/runs/{run['id']}/artifacts").json()["artifacts"][0]
    stored = app.state.services.artifacts.resolve_project_path(
        app.state.services.workflows.get(run["workflow_id"]).project_id,
        artifact["relative_path"],
    )
    original = stored.read_bytes()
    replacement = bytes([original[0] ^ 1]) + original[1:]
    assert len(replacement) == artifact["size"]
    assert hashlib.sha256(replacement).hexdigest() != artifact["sha256"]
    stored.write_bytes(replacement)
    assert_error(
        client.get(
            f"/api/runs/{run['id']}/artifacts/download",
            params={"path": artifact["relative_path"]},
        ),
        409,
        "artifact_integrity_error",
    )


def test_cors_and_websocket_origins_are_local_only(api_harness) -> None:
    client, _, _, _ = api_harness
    allowed = client.options(
        "/api/status",
        headers={
            "Origin": "http://127.0.0.1:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert allowed.headers["access-control-allow-origin"] == "http://127.0.0.1:5173"
    tauri = client.options(
        "/api/status",
        headers={"Origin": "tauri://localhost", "Access-Control-Request-Method": "GET"},
    )
    assert tauri.headers["access-control-allow-origin"] == "tauri://localhost"
    rejected = client.options(
        "/api/status",
        headers={"Origin": "https://evil.example", "Access-Control-Request-Method": "GET"},
    )
    assert "access-control-allow-origin" not in rejected.headers

    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    create_node(client)
    run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
    with pytest.raises(WebSocketDisconnect) as rejected_ws:
        with client.websocket_connect(
            f"/ws/runs/{run['id']}", headers={"Origin": "https://evil.example"}
        ):
            pass
    assert rejected_ws.value.code == 4403
    with client.websocket_connect(f"/ws/runs/{run['id']}") as websocket:
        assert websocket.receive_json()["type"] == "run.created"


def test_error_handlers_normalize_integrity_key_and_unhandled_without_leak() -> None:
    app = FastAPI()
    install_error_handlers(app)

    @app.get("/integrity")
    async def integrity():
        raise sqlite3.IntegrityError("secret table constraint")

    @app.get("/key")
    async def key():
        raise KeyError("secret-id")

    @app.get("/unhandled")
    async def unhandled():
        raise RuntimeError("database password leaked")

    with TestClient(app, raise_server_exceptions=False) as client:
        integrity_response = client.get("/integrity")
        assert_error(integrity_response, 409, "integrity_conflict")
        key_response = client.get("/key")
        assert_error(key_response, 404, "resource_not_found")
        unhandled_response = client.get("/unhandled")
        error = assert_error(unhandled_response, 500, "internal_error")
        assert error["message"] == "服务器内部错误"
        assert error["details"] == {}
        assert "password" not in unhandled_response.text


class ExplodingExecution:
    def __init__(self) -> None:
        self.node_clients: dict = {}
        self.cancelled = False

    async def start(self, _run_id: str) -> None:
        await asyncio.sleep(0)
        raise RuntimeError("start exploded secret")

    async def close(self) -> None:
        self.cancelled = True


class NoopRecovery:
    async def recover_all(self) -> None:
        return None


def test_background_start_failure_is_recorded_and_tasks_are_drained(tmp_path: Path) -> None:
    execution = ExplodingExecution()
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data"),
        planner=MockPlanner(),
        execution=execution,
        recovery=NoopRecovery(),
    )
    with TestClient(app) as client:
        project = create_project(client)
        workflow = plan_workflow(client, project["id"])
        review_workflow(client, workflow["id"])
        create_node(client)
        # 无真实节点时 diagnose 会把节点标记离线；恢复为在线以满足执行就绪门禁
        assert client.patch("/api/nodes/node-1", json={"status": "online"}).status_code == 200
        run = client.post(f"/api/workflows/{workflow['id']}/runs").json()
        assert client.post(f"/api/runs/{run['id']}/start").status_code == 202
        deadline = time.monotonic() + 1
        events = []
        while time.monotonic() < deadline:
            events = app.state.services.events.list_for_run(run["id"])
            if any(event.event_type == "run.background_failed" for event in events):
                break
            time.sleep(0.01)
        failure = next(event for event in events if event.event_type == "run.background_failed")
        assert failure.payload == {
            "code": "background_task_failed",
            "operation": "start",
            "run_id": run["id"],
        }
        assert app.state.services.runs.get(run["id"]).status.value == "failed"
        assert not app.state.services.background_tasks
    assert execution.cancelled
