from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.test_api import MockPlanner
from xuanji.api.app import CoordinatorConfig, create_coordinator_app


@pytest.fixture
def host_key_harness(tmp_path: Path, monkeypatch: pytest.MonkeyPatch):
    scanned: list[dict[str, str]] = []

    def fake_scan(host: str, port: int = 22, timeout: float = 8) -> list[dict[str, str]]:
        return list(scanned)

    monkeypatch.setattr("xuanji.api.nodes.scan_host_keys", fake_scan)
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=tmp_path / "data"),
        planner=MockPlanner(),
    )
    with TestClient(app) as client:
        response = client.post(
            "/api/nodes",
            json={
                "id": "remote-1",
                "name": "Remote",
                "kind": "remote",
                "api_url": "http://127.0.0.1:8765",
                "ssh_host": "203.0.113.10",
                "ssh_port": 22,
                "ssh_user": "deploy",
                "credential": "node-secret",
            },
        )
        assert response.status_code == 201, response.text
        yield client, tmp_path, scanned


def _key(fingerprint: str = "SHA256:aaa") -> dict[str, str]:
    return {
        "host": "203.0.113.10",
        "algorithm": "ED25519",
        "fingerprint": fingerprint,
        "line": "203.0.113.10 ssh-ed25519 AAAAC3NzaCtest",
    }


def test_inspect_reports_algorithm_fingerprint_and_known_status(host_key_harness) -> None:
    client, _, scanned = host_key_harness
    scanned.append(_key())
    response = client.post("/api/nodes/remote-1/host-key/inspect")
    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["host"] == "203.0.113.10"
    assert payload["keys"][0]["algorithm"] == "ED25519"
    assert payload["keys"][0]["fingerprint"] == "SHA256:aaa"
    assert payload["keys"][0]["known"] is False


def test_inspect_rejects_local_node(host_key_harness) -> None:
    client, _, _ = host_key_harness
    response = client.post(
        "/api/nodes",
        json={"id": "local-1", "name": "Local", "kind": "local", "api_url": "http://127.0.0.1:8765", "credential": "x"},
    )
    assert response.status_code == 201, response.text
    response = client.post("/api/nodes/local-1/host-key/inspect")
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "node_not_remote"


def test_confirm_writes_known_hosts_and_marks_known(host_key_harness) -> None:
    client, tmp_path, scanned = host_key_harness
    scanned.append(_key())
    response = client.post(
        "/api/nodes/remote-1/host-key/confirm",
        json={"algorithm": "ED25519", "fingerprint": "SHA256:aaa"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["recorded"] is True
    known_hosts = tmp_path / "data" / "ssh" / "known_hosts"
    assert "ssh-ed25519 AAAAC3NzaCtest" in known_hosts.read_text()

    inspected = client.post("/api/nodes/remote-1/host-key/inspect").json()
    assert inspected["keys"][0]["known"] is True


def test_confirm_rejects_fingerprint_race(host_key_harness) -> None:
    client, tmp_path, scanned = host_key_harness
    scanned.append(_key("SHA256:changed-after-inspect"))
    response = client.post(
        "/api/nodes/remote-1/host-key/confirm",
        json={"algorithm": "ED25519", "fingerprint": "SHA256:aaa"},
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "host_key_changed"
    known_hosts = tmp_path / "data" / "ssh" / "known_hosts"
    assert "AAAAC3NzaCtest" not in known_hosts.read_text()


def test_diagnose_returns_layered_steps(host_key_harness) -> None:
    client, _, _ = host_key_harness
    response = client.post("/api/nodes/remote-1/diagnose")
    assert response.status_code == 503, response.text
    details = response.json()["error"]["details"]
    steps = {step["step"]: step["status"] for step in details["steps"]}
    assert set(steps) == {"dns", "tcp", "ssh", "node_agent", "hermes"}
    assert details["layer"] in steps
