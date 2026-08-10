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
    with TestClient(app) as client:
        response = client.get("/api/status")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_desktop_session_token_protects_api_but_not_health(tmp_path: Path):
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "secured", session_token="desktop-session")
    )
    with TestClient(app) as client:
        assert client.get("/api/status").status_code == 200
        denied = client.get("/api/projects")
        assert denied.status_code == 401
        assert denied.json()["error"]["code"] == "invalid_session"
        allowed = client.get(
            "/api/projects",
            headers={"X-Xuanji-Session": "desktop-session"},
        )
        assert allowed.status_code == 200


def test_list_projects_empty(tmp_path: Path):
    app = make_app(tmp_path)
    with TestClient(app) as client:
        response = client.get("/api/projects")
    assert response.status_code == 200
    assert response.json() == []


def test_discover_local_hermes(tmp_path: Path):
    app = make_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/api/nodes/local/discover")
    assert response.status_code == 200
    data = response.json()
    assert "found" in data


def test_create_run_not_found(tmp_path: Path):
    app = make_app(tmp_path)
    with TestClient(app) as client:
        response = client.post("/api/workflows/nonexistent/runs")
    assert response.status_code == 404
