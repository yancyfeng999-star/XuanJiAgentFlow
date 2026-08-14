from pathlib import Path

from fastapi.testclient import TestClient

from xuanji.api.app import CoordinatorConfig, create_coordinator_app


def client_for(tmp_path: Path) -> TestClient:
    app = create_coordinator_app(CoordinatorConfig(data_dir=tmp_path / "data"))
    return TestClient(app)


def test_empty_list(tmp_path: Path) -> None:
    with client_for(tmp_path) as client:
        response = client.get("/api/thinking-models")
    assert response.status_code == 200
    assert response.json()["items"] == []


def test_create_update_default_and_redaction(tmp_path: Path) -> None:
    with client_for(tmp_path) as client:
        created = client.post(
            "/api/thinking-models",
            json={
                "display_name": "GPT",
                "api_mode": "responses",
                "base_url": "https://api.openai.com/v1",
                "model_id": "gpt-5.4",
                "credential": "sk-secret-value",
            },
        )
        assert created.status_code == 200
        body = created.json()
        assert "sk-secret-value" not in created.text
        assert body["credential_configured"] is True
        assert body["is_default"] is True
        assert body["credential_key"].startswith("thinking-model.")

        listed = client.get("/api/thinking-models").json()["items"]
        assert len(listed) == 1
        assert "sk-secret-value" not in str(listed)

        second = client.post(
            "/api/thinking-models",
            json={
                "display_name": "Compat",
                "api_mode": "chat_completions",
                "base_url": "https://api.deepseek.com",
                "model_id": "deepseek-chat",
                "credential": "sk-other",
            },
        ).json()
        client.put(f"/api/thinking-models/{second['id']}/default")
        items = client.get("/api/thinking-models").json()["items"]
        defaults = [item for item in items if item["is_default"]]
        assert len(defaults) == 1
        assert defaults[0]["id"] == second["id"]

        conflict = client.delete(f"/api/thinking-models/{second['id']}")
        assert conflict.status_code == 409


def test_invalid_url_rejected(tmp_path: Path) -> None:
    with client_for(tmp_path) as client:
        response = client.post(
            "/api/thinking-models",
            json={
                "display_name": "Bad",
                "api_mode": "responses",
                "base_url": "not-a-url",
                "model_id": "x",
            },
        )
    assert response.status_code == 422
