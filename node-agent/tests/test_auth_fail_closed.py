from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app import create_app


def test_empty_token_fails_closed_at_startup(tmp_path: Path) -> None:
    with pytest.raises(RuntimeError, match="XUANJI_NODE_TOKEN"):
        create_app(root=tmp_path / "tasks", token="", hermes_url="http://fake", hermes_token="")


def test_empty_env_token_fails_closed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("XUANJI_NODE_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="XUANJI_NODE_TOKEN"):
        create_app(root=tmp_path / "tasks")


def test_wrong_token_does_not_leak_expected_value(tmp_path: Path) -> None:
    app = create_app(root=tmp_path / "tasks", token="correct-token", hermes_url="http://fake", hermes_token="")
    client = TestClient(app)
    response = client.get("/v1/health", headers={"Authorization": "Bearer wrong-token"})
    assert response.status_code == 401
    assert "correct-token" not in response.text


def test_all_protected_endpoints_require_token(tmp_path: Path) -> None:
    app = create_app(root=tmp_path / "tasks", token="secret", hermes_url="http://fake", hermes_token="")
    client = TestClient(app)
    assert client.get("/v1/health").status_code == 401
    assert client.get("/v1/capabilities").status_code == 401
    assert client.post("/v1/tasks", json={"goal": "x", "idempotency_key": "k"}).status_code == 401
    assert client.get("/v1/tasks/t1").status_code == 401
    assert client.post("/v1/tasks/t1/cancel").status_code == 401
    assert client.get("/v1/tasks/t1/logs").status_code == 401
    assert client.get("/v1/tasks/t1/artifacts").status_code == 401
