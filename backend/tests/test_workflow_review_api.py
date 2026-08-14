from __future__ import annotations

from tests.test_api import (
    MockPlanner,
    api_harness,  # noqa: F401  (fixture)
    create_node,
    create_project,
    plan_workflow,
    review_workflow,
)


def _prepare(client, workflow_id: str) -> dict:
    response = client.post(f"/api/workflows/{workflow_id}/review/prepare")
    assert response.status_code == 200, response.text
    return response.json()


def test_prepare_returns_stable_snapshot_hash(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    first = _prepare(client, workflow["id"])
    second = _prepare(client, workflow["id"])
    assert first["snapshot_hash"] == second["snapshot_hash"]
    assert len(first["snapshot_hash"]) == 64
    assert first["task_count"] == 2
    assert first["topological_order"] == ["research", "write"]


def test_snapshot_hash_changes_when_workflow_changes(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    before = _prepare(client, workflow["id"])
    tasks = workflow["tasks"]
    tasks[0]["prompt"] = "changed prompt"
    response = client.put(f"/api/workflows/{workflow['id']}", json={"tasks": tasks})
    assert response.status_code == 200, response.text
    after = _prepare(client, workflow["id"])
    assert before["snapshot_hash"] != after["snapshot_hash"]


def test_review_rejects_stale_snapshot(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    prepared = _prepare(client, workflow["id"])
    tasks = workflow["tasks"]
    tasks[0]["title"] = "Renamed"
    client.put(f"/api/workflows/{workflow['id']}", json={"tasks": tasks})
    response = client.post(
        f"/api/workflows/{workflow['id']}/review",
        json={"snapshot_hash": prepared["snapshot_hash"], "acknowledged_warnings": []},
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "review_snapshot_stale"


def test_review_requires_warning_acknowledgement(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    prepared = _prepare(client, workflow["id"])
    assert any(w["code"] == "task_without_expected_outputs" for w in prepared["warnings"])
    response = client.post(
        f"/api/workflows/{workflow['id']}/review",
        json={"snapshot_hash": prepared["snapshot_hash"], "acknowledged_warnings": []},
    )
    assert response.status_code == 409, response.text
    error = response.json()["error"]
    assert error["code"] == "review_warnings_unacknowledged"
    assert "task_without_expected_outputs" in error["details"]["unacknowledged"]


def test_review_persists_snapshot_and_warnings(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    reviewed = review_workflow(client, workflow["id"])
    assert reviewed["status"] == "reviewed"
    assert reviewed["review_snapshot_hash"]
    assert reviewed["reviewed_at"]
    assert reviewed["reviewed_by"] == "user"
    assert "task_without_expected_outputs" in reviewed["review_warnings"]

    reloaded = client.get(f"/api/workflows/{workflow['id']}").json()
    assert reloaded["review_snapshot_hash"] == reviewed["review_snapshot_hash"]
    assert reloaded["review_warnings"] == reviewed["review_warnings"]


def test_reviewed_workflow_is_immutable(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.put(
        f"/api/workflows/{workflow['id']}",
        json={"tasks": workflow["tasks"]},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "workflow_frozen"


def test_revision_clones_reviewed_workflow_as_new_draft(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    review_workflow(client, workflow["id"])
    response = client.post(f"/api/workflows/{workflow['id']}/revisions")
    assert response.status_code == 201, response.text
    revision = response.json()
    assert revision["id"] != workflow["id"]
    assert revision["version"] == workflow["version"] + 1
    assert revision["status"] == "draft"
    assert revision["review_snapshot_hash"] is None
    assert len(revision["tasks"]) == len(workflow["tasks"])
    assert all(task["workflow_id"] == revision["id"] for task in revision["tasks"])

    original = client.get(f"/api/workflows/{workflow['id']}").json()
    assert original["status"] == "reviewed"
    assert original["review_snapshot_hash"]


def test_revision_requires_reviewed_source(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    workflow = plan_workflow(client, project["id"])
    response = client.post(f"/api/workflows/{workflow['id']}/revisions")
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "revision_source_not_reviewed"


def test_run_binds_reviewed_version_and_snapshot(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    create_node(client)
    workflow = plan_workflow(client, project["id"])
    reviewed = review_workflow(client, workflow["id"])
    revision = client.post(f"/api/workflows/{workflow['id']}/revisions").json()
    assert revision["status"] == "draft"

    response = client.post(f"/api/workflows/{workflow['id']}/runs")
    assert response.status_code == 201, response.text
    run = response.json()
    assert run["workflow_version"] == workflow["version"]
    assert run["review_snapshot_hash"] == reviewed["review_snapshot_hash"]


def test_schema_v3_database_upgrades_and_stays_readable(tmp_path) -> None:
    from xuanji.storage import migrations
    from xuanji.storage.database import Database
    from xuanji.storage.repositories import WorkflowRepository

    original_version = migrations.CURRENT_SCHEMA_VERSION
    try:
        # 用 v3 schema 手工落库，模拟旧版本生成的数据库
        migrations.CURRENT_SCHEMA_VERSION = 3
        database = Database(tmp_path / "old.db")
        database.migrate()
        database.connection.execute(
            "INSERT INTO projects(id,name,root_path,active_workflow_version,created_at,updated_at) VALUES (?,?,?,?,?,?)",
            ("project-old", "Old", "/tmp/old", 1, "2026-08-01T00:00:00+00:00", "2026-08-01T00:00:00+00:00"),
        )
        database.connection.execute(
            "INSERT INTO workflows(id,project_id,version,goal,planner_provider,planner_model,status,graph_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            ("workflow-old", "project-old", 1, "legacy", None, None, "draft", "{}", "2026-08-01T00:00:00+00:00"),
        )
        database.connection.execute(
            """INSERT INTO tasks(id,workflow_id,title,description,prompt,agent_type,dependencies_json,
            execution_policy_json,retry_policy_json,expected_outputs_json,ui_position_json)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            ("only", "workflow-old", "Only", "", "", "general", "[]",
             "{\"mode\":\"auto\",\"node_id\":null,\"node_group\":null,\"required_models\":[],\"required_tools\":[],\"required_tags\":[],\"timeout_seconds\":1800}",
             "{\"max_attempts\":3,\"delay_seconds\":1}", "[]", "{}"),
        )
        database.connection.commit()
        database.close()

        migrations.CURRENT_SCHEMA_VERSION = original_version
        upgraded = Database(tmp_path / "old.db")
        upgraded.migrate()
        restored = WorkflowRepository(upgraded).get("workflow-old")
        assert restored is not None
        assert restored.status.value == "draft"
        assert restored.review_snapshot_hash is None
        assert restored.review_warnings == []
        assert [task.id for task in restored.tasks] == ["only"]
        row = upgraded.connection.execute("SELECT MAX(version) AS v FROM schema_version").fetchone()
        assert row["v"] == original_version
        upgraded.close()
    finally:
        migrations.CURRENT_SCHEMA_VERSION = original_version
