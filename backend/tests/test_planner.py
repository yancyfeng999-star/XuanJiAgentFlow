import json

import httpx
import pytest

from xuanji.planner import (
    OpenAIChatCompletionsProvider,
    PlannerError,
    PlannerProvider,
    PlannerService,
)
from xuanji.security import CredentialVault


def workflow_output(
    *,
    workflow_id: str = "workflow_1",
    dependencies: list[str] | None = None,
) -> str:
    return json.dumps(
        {
            "id": workflow_id,
            "project_id": "ignored_project",
            "version": 1,
            "goal": "ignored goal",
            "tasks": [
                {
                    "id": "task_1",
                    "workflow_id": workflow_id,
                    "title": "Research",
                    "dependencies": dependencies or [],
                }
            ],
        }
    )


def openai_response(content: str, status_code: int = 200) -> httpx.Response:
    return httpx.Response(
        status_code,
        json={"choices": [{"message": {"content": content}}]},
    )


def make_vault(tmp_path, key: str = "planner.deepseek.api_key") -> CredentialVault:
    vault = CredentialVault(tmp_path / "credentials.vault")
    vault.initialize("master password")
    vault.set(key, "vault-only-secret")
    return vault


@pytest.mark.asyncio
async def test_openai_provider_uses_configured_vault_key_and_deepseek_config(tmp_path):
    vault = make_vault(tmp_path)
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return openai_response("planned")

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )

    result = await provider.complete(
        [{"role": "user", "content": "Plan this"}],
        model="deepseek-chat",
    )

    assert result == "planned"
    assert requests[0].url == "https://api.deepseek.com/chat/completions"
    assert requests[0].headers["Authorization"] == "Bearer vault-only-secret"
    assert json.loads(requests[0].content) == {
        "messages": [{"role": "user", "content": "Plan this"}],
        "model": "deepseek-chat",
    }


@pytest.mark.asyncio
async def test_openai_provider_accepts_injected_client_and_mimo_base_url(tmp_path):
    vault = make_vault(tmp_path, "planner.mimo.api_key")

    async def handler(request: httpx.Request) -> httpx.Response:
        assert request.url == "https://api.xiaomimimo.com/v1/chat/completions"
        assert json.loads(request.content)["model"] == "mimo-v2-flash"
        return openai_response("planned")

    client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.xiaomimimo.com/v1/",
        credential_vault=vault,
        credential_key="planner.mimo.api_key",
        client=client,
    )

    assert await provider.complete([], model="mimo-v2-flash") == "planned"
    assert not client.is_closed
    await client.aclose()


@pytest.mark.asyncio
async def test_planner_clears_code_fence_and_builds_valid_domain_workflow(tmp_path):
    vault = make_vault(tmp_path)
    request_payloads: list[dict] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        request_payloads.append(json.loads(request.content))
        return openai_response(f"```json\n{workflow_output()}\n```")

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )
    service = PlannerService(provider, model="deepseek-chat", provider_name="deepseek")

    workflow = await service.plan(
        project_id="project_1",
        goal="Build a report",
        context="Use local sources",
        constraints={"max_tasks": 3},
    )

    assert workflow.project_id == "project_1"
    assert workflow.goal == "Build a report"
    assert workflow.planner_provider == "deepseek"
    assert workflow.planner_model == "deepseek-chat"
    assert workflow.topological_order() == ["task_1"]
    assert len(request_payloads) == 1
    messages = request_payloads[0]["messages"]
    assert "Use local sources" in messages[-1]["content"]
    assert '"max_tasks": 3' in messages[-1]["content"]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "invalid_output",
    [
        "not-json",
        json.dumps(
            {
                "id": "workflow_1",
                "project_id": "p",
                "version": 1,
                "goal": "g",
                "tasks": [{"id": "task_1", "workflow_id": "workflow_1"}],
            }
        ),
        json.dumps(
            {
                "id": "workflow_1",
                "project_id": "p",
                "version": 1,
                "goal": "g",
                "tasks": [
                    {
                        "id": "task_1",
                        "workflow_id": "workflow_1",
                        "title": "One",
                        "dependencies": ["task_2"],
                    },
                    {
                        "id": "task_2",
                        "workflow_id": "workflow_1",
                        "title": "Two",
                        "dependencies": ["task_1"],
                    },
                ],
            }
        ),
    ],
    ids=["invalid-json", "schema-error", "dag-cycle"],
)
async def test_planner_repairs_invalid_output_once(tmp_path, invalid_output):
    vault = make_vault(tmp_path)
    outputs = iter([invalid_output, workflow_output()])
    messages_seen: list[list[dict[str, str]]] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        messages_seen.append(json.loads(request.content)["messages"])
        return openai_response(next(outputs))

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )
    service = PlannerService(provider, model="deepseek-chat", provider_name="deepseek")

    workflow = await service.plan("project_1", "Build report", "", {})

    assert workflow.id == "workflow_1"
    assert len(messages_seen) == 2
    assert invalid_output in messages_seen[1][-1]["content"]


@pytest.mark.asyncio
async def test_planner_stops_after_one_failed_repair_with_stable_error(tmp_path):
    vault = make_vault(tmp_path)
    call_count = 0

    async def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return openai_response("still not json")

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )
    service = PlannerService(provider, model="deepseek-chat", provider_name="deepseek")

    with pytest.raises(PlannerError) as exc_info:
        await service.plan("project_1", "Build report", "", {})

    assert exc_info.value.code == "planner_invalid_output"
    assert str(exc_info.value) == "planner output is invalid after repair"
    assert call_count == 2


@pytest.mark.asyncio
async def test_openai_provider_maps_unauthorized_without_leaking_credentials(tmp_path, caplog):
    vault = make_vault(tmp_path)

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, text="request rejected for vault-only-secret")

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(PlannerError) as exc_info:
        await provider.complete([], "deepseek-chat")

    assert exc_info.value.code == "planner_unauthorized"
    assert str(exc_info.value) == "planner provider rejected credentials"
    assert "vault-only-secret" not in str(exc_info.value)
    assert "vault-only-secret" not in caplog.text
    assert "vault-only-secret" not in (tmp_path / "credentials.vault").read_text()


@pytest.mark.asyncio
async def test_openai_provider_maps_timeout_to_stable_error(tmp_path):
    vault = make_vault(tmp_path)

    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("upstream timeout includes vault-only-secret", request=request)

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(PlannerError) as exc_info:
        await provider.complete([], "deepseek-chat")

    assert exc_info.value.code == "planner_timeout"
    assert str(exc_info.value) == "planner provider timed out"
    assert "vault-only-secret" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_openai_provider_maps_connection_error_without_leaking_credentials(tmp_path):
    vault = make_vault(tmp_path)

    async def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("failed with vault-only-secret", request=request)

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(PlannerError) as exc_info:
        await provider.complete([], "deepseek-chat")

    assert exc_info.value.code == "planner_provider_error"
    assert "vault-only-secret" not in str(exc_info.value)


@pytest.mark.asyncio
async def test_openai_provider_rejects_non_string_content(tmp_path):
    vault = make_vault(tmp_path)

    async def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"choices": [{"message": {"content": None}}]},
        )

    provider = OpenAIChatCompletionsProvider(
        base_url="https://api.deepseek.com/v1",
        credential_vault=vault,
        credential_key="planner.deepseek.api_key",
        transport=httpx.MockTransport(handler),
    )

    with pytest.raises(PlannerError) as exc_info:
        await provider.complete([], "deepseek-chat")

    assert exc_info.value.code == "planner_provider_error"


def test_planner_provider_protocol_describes_complete_interface():
    assert "complete" in PlannerProvider.__protocol_attrs__
