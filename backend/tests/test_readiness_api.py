from __future__ import annotations

from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from tests.fakes.fake_node import FakeNode, FakeNodeMode
from tests.test_api import (
    MockPlanner,
    create_node,
    create_project,
    plan_workflow,
    review_workflow,
)
from xuanji.api.app import CoordinatorConfig, create_coordinator_app
from xuanji.nodes import NodeClient


@pytest.fixture
def readiness_harness(tmp_path: Path):
    fake = FakeNode(FakeNodeMode.SUCCESS, token="node-secret")
    node_client = NodeClient(
        "http://node-1.test",
        fake.token,
        client=httpx.AsyncClient(transport=fake.transport(), base_url="http://node-1.test"),
    )

    def node_client_factory(base_url: str, token: str) -> NodeClient:
        return NodeClient(
            base_url,
            token,
            client=httpx.AsyncClient(transport=fake.transport(), base_url=base_url),
        )

    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data", poll_interval=0.001),
        planner=MockPlanner(),
        node_clients={"node-1": node_client},
        node_client_factory=node_client_factory,
    )
    with TestClient(app) as client:
        yield client, app
    fake.close()


def _codes(payload: dict) -> set[str]:
    return {issue["code"] for issue in payload["issues"]}


def test_readiness_blocks_when_nothing_configured(tmp_path: Path) -> None:
    app = create_coordinator_app(CoordinatorConfig(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        response = client.get("/api/readiness")
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is False
    codes = _codes(payload)
    assert {"project_missing", "planner_not_configured", "node_missing"} <= codes
    assert payload["checks"]["project"] == "blocked"
    assert payload["checks"]["planner"] == "blocked"
    assert payload["checks"]["nodes"] == "blocked"
    for issue in payload["issues"]:
        assert issue["action"] in {
            "open_project", "open_planner", "open_nodes", "open_workflow", "retry",
        }
        assert isinstance(issue["title"], str) and issue["title"]
        assert isinstance(issue["message"], str) and issue["message"]


def test_readiness_ready_after_full_setup(readiness_harness) -> None:
    client, _ = readiness_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.get(
        "/api/readiness",
        params={"project_id": project["id"], "workflow_id": workflow["id"]},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["ready"] is True, payload
    assert payload["issues"] == []
    assert set(payload["checks"]) == {
        "project", "planner", "workflow", "tasks", "nodes", "credentials",
    }
    assert all(status == "ready" for status in payload["checks"].values())
    assert payload["projectId"] == project["id"]
    assert payload["workflowId"] == workflow["id"]


def test_readiness_flags_unreviewed_workflow(readiness_harness) -> None:
    client, _ = readiness_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    payload = client.get(
        "/api/readiness",
        params={"project_id": project["id"], "workflow_id": workflow["id"]},
    ).json()
    assert payload["ready"] is False
    assert "workflow_not_reviewed" in _codes(payload)
    assert payload["checks"]["workflow"] == "blocked"


def test_readiness_flags_task_without_matching_node(readiness_harness) -> None:
    client, _ = readiness_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    tasks = workflow["tasks"]
    tasks[0]["execution_policy"]["required_models"] = ["nonexistent-model"]
    response = client.put(
        f"/api/workflows/{workflow['id']}",
        json={"tasks": tasks},
    )
    assert response.status_code == 200, response.text
    review_workflow(client, workflow["id"])
    payload = client.get(
        "/api/readiness",
        params={"project_id": project["id"], "workflow_id": workflow["id"]},
    ).json()
    assert payload["ready"] is False
    assert "task_without_matching_node" in _codes(payload)
    assert payload["checks"]["tasks"] == "blocked"


def test_readiness_flags_missing_node_credential(readiness_harness) -> None:
    client, _ = readiness_harness
    response = client.post(
        "/api/nodes",
        json={
            "id": "node-no-cred",
            "name": "No Credential Node",
            "kind": "local",
            "api_url": "http://node-1.test",
            "status": "online",
        },
    )
    assert response.status_code == 201, response.text
    payload = client.get("/api/readiness").json()
    assert payload["ready"] is False
    assert "node_credential_missing" in _codes(payload)
    assert payload["checks"]["credentials"] == "blocked"


def test_readiness_flags_missing_planner_credential(readiness_harness) -> None:
    client, _ = readiness_harness
    response = client.put(
        "/api/planner/config",
        json={
            "base_url": "https://planner.test",
            "model": "mock-model",
            "credential_key": "planner.test.key",
        },
    )
    assert response.status_code == 200, response.text
    payload = client.get("/api/readiness").json()
    assert payload["ready"] is False
    assert "planner_credential_missing" in _codes(payload)
    assert payload["checks"]["planner"] == "blocked"


def test_create_run_blocked_by_server_side_readiness(readiness_harness) -> None:
    client, _ = readiness_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert response.status_code == 409, response.text
    error = response.json()["error"]
    assert error["code"] == "run_not_ready"
    codes = {issue["code"] for issue in error["details"]["issues"]}
    assert "node_missing" in codes


def test_start_run_rechecks_readiness(readiness_harness) -> None:
    client, _ = readiness_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert response.status_code == 201, response.text
    run = response.json()
    response = client.patch("/api/nodes/node-1", json={"status": "offline"})
    assert response.status_code == 200, response.text
    response = client.post(f"/api/runs/{run['id']}/start")
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "run_not_ready"


def test_readiness_without_context_marks_workflow_unknown(readiness_harness) -> None:
    client, _ = readiness_harness
    create_node(client)
    payload = client.get("/api/readiness").json()
    assert payload["checks"]["workflow"] == "unknown"
    assert payload["checks"]["tasks"] == "unknown"
    assert payload["checks"]["nodes"] == "ready"


def test_readiness_deep_mode_detects_unreachable_node(readiness_harness) -> None:
    client, app = readiness_harness
    create_node(client)
    app.state.services.node_clients.clear()
    payload = client.get("/api/readiness", params={"mode": "deep"}).json()
    assert "node_client_unavailable" in _codes(payload)
