import json

import httpx
import pytest

from xuanji.credentials import LocalCredentialStore
from xuanji.planner.providers import PlannerError
from xuanji.thinking_models.providers import OpenAIResponsesProvider


@pytest.mark.asyncio
async def test_responses_extracts_output_text(tmp_path):
    store = LocalCredentialStore(tmp_path / "c.json")
    store.set("k", "secret")
    requests: list[httpx.Request] = []

    async def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json={"output_text": json.dumps({"ok": True})})

    provider = OpenAIResponsesProvider(
        base_url="https://api.openai.com/v1",
        credential_store=store,
        credential_key="k",
        transport=httpx.MockTransport(handler),
    )
    result = await provider.complete([{"role": "user", "content": "hi"}], "gpt-5.4", reasoning_effort="low")
    assert result == json.dumps({"ok": True})
    body = json.loads(requests[0].content)
    assert requests[0].url.path.endswith("/responses")
    assert body["reasoning"] == {"effort": "low"}
    assert "secret" not in result


@pytest.mark.asyncio
async def test_responses_401(tmp_path):
    store = LocalCredentialStore(tmp_path / "c.json")
    store.set("k", "secret")

    async def handler(_request: httpx.Request) -> httpx.Response:
        return httpx.Response(401, json={"error": "no"})

    provider = OpenAIResponsesProvider(
        base_url="https://api.openai.com/v1",
        credential_store=store,
        credential_key="k",
        transport=httpx.MockTransport(handler),
    )
    with pytest.raises(PlannerError) as error:
        await provider.complete([], "gpt")
    assert error.value.code == "planner_unauthorized"
