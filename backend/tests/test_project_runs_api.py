from __future__ import annotations

import time

import pytest
from fastapi.testclient import TestClient

from tests.test_api import (
    api_harness,  # noqa: F401  (fixture)
    create_node,
    create_project,
    create_reviewed_run,
    plan_workflow,
    review_workflow,
    wait_for_run,
)


def test_project_runs_empty_for_new_project(api_harness) -> None:
    client, _, _, _ = api_harness
    project = create_project(client)
    response = client.get(f"/api/projects/{project['id']}/runs")
    assert response.status_code == 200
    assert response.json() == {"runs": [], "next_cursor": None}


def test_project_runs_unknown_project_is_404(api_harness) -> None:
    client, _, _, _ = api_harness
    response = client.get("/api/projects/project-missing/runs")
    assert response.status_code == 404


def test_project_runs_paginate_stably(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    project, workflow, first = create_reviewed_run(client)
    for _ in range(3):
        response = client.post(f"/api/workflows/{workflow['id']}/runs")
        assert response.status_code == 201, response.text
        time.sleep(0.002)

    page1 = client.get(f"/api/projects/{project['id']}/runs", params={"limit": 2}).json()
    assert len(page1["runs"]) == 2
    assert page1["next_cursor"]
    page2 = client.get(
        f"/api/projects/{project['id']}/runs",
        params={"limit": 2, "cursor": page1["next_cursor"]},
    ).json()
    all_ids = [run["id"] for run in page1["runs"]] + [run["id"] for run in page2["runs"]]
    assert len(all_ids) == len(set(all_ids)) == 4
    assert first["id"] in all_ids
    other = create_project(client, name="Other")
    assert all(run["workflow_id"] == workflow["id"] for run in page1["runs"] + page2["runs"])
    assert client.get(f"/api/projects/{other['id']}/runs").json()["runs"] == []


def test_project_runs_summary_binds_version_and_counts(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    project, workflow, run = create_reviewed_run(client)
    client.post(f"/api/runs/{run['id']}/start")
    wait_for_run(client, run["id"], {"success", "failed", "blocked"})
    summaries = client.get(f"/api/projects/{project['id']}/runs").json()["runs"]
    assert len(summaries) == 1
    summary = summaries[0]
    assert summary["workflow_version"] == workflow["version"]
    assert summary["review_snapshot_hash"]
    assert summary["task_count"] == 2
    assert summary["task_status_counts"]
    assert summary["allowed_actions"] == []


def test_run_payload_exposes_allowed_actions(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    _, _, run = create_reviewed_run(client)
    payload = client.get(f"/api/runs/{run['id']}").json()
    assert "start" in payload["allowed_actions"]
    assert "cancel" in payload["allowed_actions"]
    assert "pause" not in payload["allowed_actions"]
    assert payload["attempts"] == []


def test_allowed_actions_track_run_state(api_harness) -> None:
    client, _, _, _ = api_harness
    create_node(client)
    _, _, run = create_reviewed_run(client)
    client.post(f"/api/runs/{run['id']}/start")
    final = wait_for_run(client, run["id"], {"success", "failed", "blocked"})
    assert final["allowed_actions"] == []
    cancelled = client.post(f"/api/runs/{run['id']}/cancel")
    assert cancelled.status_code in {200, 409}
