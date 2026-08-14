from pathlib import Path

from fastapi.testclient import TestClient

from xuanji.api.app import CoordinatorConfig, create_coordinator_app
from xuanji.credentials import LocalCredentialStore
from xuanji.storage.database import Database
from xuanji.storage.repositories import ConfigRepository


def test_legacy_planner_migrates_once_and_keeps_credential_key(tmp_path: Path) -> None:
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    database = Database(data_dir / "coordinator.db")
    database.migrate()
    config = ConfigRepository(database)
    config.set("planner", {
        "base_url": "https://api.deepseek.com",
        "model": "deepseek-chat",
        "credential_key": "planner.primary",
    })
    vault = LocalCredentialStore(data_dir / "credentials.json")
    vault.set("planner.primary", "legacy-secret")
    database.close()

    app = create_coordinator_app(CoordinatorConfig(data_dir=data_dir))
    with TestClient(app) as client:
        items = client.get("/api/thinking-models").json()["items"]
        assert len(items) == 1
        assert items[0]["is_default"] is True
        assert items[0]["api_mode"] == "chat_completions"
        assert items[0]["credential_key"] == "planner.primary"
        assert items[0]["credential_configured"] is True
        assert "legacy-secret" not in client.get("/api/thinking-models").text
        planner = client.get("/api/planner/config").json()
        assert planner["credential_key"] == "planner.primary"

    # second boot is idempotent
    app2 = create_coordinator_app(CoordinatorConfig(data_dir=data_dir))
    with TestClient(app2) as client:
        assert len(client.get("/api/thinking-models").json()["items"]) == 1
