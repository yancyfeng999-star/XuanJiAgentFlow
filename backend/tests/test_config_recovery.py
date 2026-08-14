from fastapi.testclient import TestClient

from xuanji.api.app import CoordinatorConfig, create_coordinator_app


def test_recovery_state_is_not_safe_mode_on_healthy_start(tmp_path) -> None:
    app = create_coordinator_app(CoordinatorConfig(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        payload = client.get("/api/recovery").json()
    assert payload["safe_mode"] is False
    assert "open_diagnostics" in payload["available_actions"]
