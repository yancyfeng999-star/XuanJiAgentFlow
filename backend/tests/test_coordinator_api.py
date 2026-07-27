from __future__ import annotations

import pytest
from pathlib import Path

from xuanji.api.coordinator import create_coordinator_app, CoordinatorConfig
from fastapi.testclient import TestClient


def make_app(tmp_path: Path):
    config = CoordinatorConfig(data_dir=tmp_path / "data")
    return create_coordinator_app(config)


def test_health(tmp_path: Path):
    app = make_app(tmp_path)
    client = TestClient(app)
    response = client.get("/api/status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_list_projects_empty(tmp_path: Path):
    app = make_app(tmp_path)
    client = TestClient(app)
    response = client.get("/api/projects")
    assert response.status_code == 200
    assert response.json() == []


def test_discover_local_hermes(tmp_path: Path):
    app = make_app(tmp_path)
    client = TestClient(app)
    response = client.post("/api/nodes/local/discover")
    assert response.status_code == 200
    data = response.json()
    assert "found" in data


def test_create_run_not_found(tmp_path: Path):
    app = make_app(tmp_path)
    client = TestClient(app)
    response = client.post("/api/workflows/nonexistent/runs")
    assert response.status_code == 404
