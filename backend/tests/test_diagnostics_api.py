from fastapi.testclient import TestClient

from xuanji.api.app import CoordinatorConfig, create_coordinator_app


def test_diagnostics_omits_secrets(tmp_path) -> None:
    app = create_coordinator_app(CoordinatorConfig(data_dir=tmp_path / "data"))
    with TestClient(app) as client:
        client.post(
            "/api/thinking-models",
            json={
                "display_name": "GPT",
                "api_mode": "chat_completions",
                "base_url": "https://api.openai.com/v1",
                "model_id": "gpt",
                "credential": "sk-super-secret-value",
            },
        )
        payload = client.get("/api/diagnostics").json()
    text = str(payload)
    assert "sk-super-secret-value" not in text
    assert "Authorization" not in text
    assert payload["thinkingModels"]["total"] == 1
    assert "/" not in payload["paths"]["dataDir"] or payload["paths"]["dataDir"] == "data"
