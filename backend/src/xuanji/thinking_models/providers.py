from __future__ import annotations

from typing import Any, Protocol

import httpx

from xuanji.planner.providers import PlannerError


class ThinkingModelProvider(Protocol):
    async def complete(
        self,
        messages: list[dict[str, str]],
        model: str,
        *,
        reasoning_effort: str | None = None,
    ) -> str: ...


def _raise_for_status(response: httpx.Response) -> None:
    if response.status_code == 401:
        raise PlannerError("planner_unauthorized", "思考模型身份验证失败，请检查接口密钥")
    if response.status_code == 429:
        raise PlannerError("planner_provider_error", "思考模型请求过于频繁，请稍后重试")
    if response.status_code >= 400:
        text = response.text.lower()
        if "unsupported" in text and "reasoning" in text:
            raise PlannerError("planner_provider_error", "当前模型不支持 reasoning_effort，请关闭该参数")
        raise PlannerError("planner_provider_error", "思考模型服务请求失败")


class OpenAIResponsesProvider:
    def __init__(
        self,
        *,
        base_url: str,
        credential_store,
        credential_key: str,
        client: httpx.AsyncClient | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ):
        self._url = f"{base_url.rstrip('/')}/responses"
        self._credentials = credential_store
        self._credential_key = credential_key
        self._client = client
        self._transport = transport
        self._timeout = timeout

    async def complete(
        self,
        messages: list[dict[str, str]],
        model: str,
        *,
        reasoning_effort: str | None = None,
    ) -> str:
        api_key = self._credentials.get(self._credential_key)
        if not api_key:
            raise PlannerError("planner_credentials_missing", "思考模型接口密钥尚未配置")
        payload: dict[str, Any] = {
            "model": model,
            "input": messages,
            "text": {"format": {"type": "json_object"}},
        }
        if reasoning_effort:
            payload["reasoning"] = {"effort": reasoning_effort}
        try:
            if self._client is not None:
                response = await self._client.post(
                    self._url,
                    headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                    json=payload,
                )
            else:
                async with httpx.AsyncClient(transport=self._transport, timeout=self._timeout) as client:
                    response = await client.post(
                        self._url,
                        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                        json=payload,
                    )
        except httpx.TimeoutException:
            raise PlannerError("planner_timeout", "思考模型服务请求超时") from None
        except httpx.RequestError:
            raise PlannerError("planner_provider_error", "思考模型服务请求失败") from None
        _raise_for_status(response)
        try:
            data = response.json()
            if isinstance(data.get("output_text"), str) and data["output_text"]:
                return data["output_text"]
            for item in data.get("output", []):
                for content in item.get("content", []):
                    if isinstance(content.get("text"), str):
                        return content["text"]
            raise PlannerError("planner_provider_error", "思考模型返回内容缺少文本")
        except PlannerError:
            raise
        except (ValueError, KeyError, TypeError):
            raise PlannerError("planner_provider_error", "思考模型服务请求失败") from None


def provider_for(profile, credentials, transport=None):
    common = {
        "base_url": str(profile.base_url).rstrip("/"),
        "credential_store": credentials,
        "credential_key": profile.credential_key,
        "transport": transport,
    }
    if profile.api_mode == "responses":
        return OpenAIResponsesProvider(**common)
    from xuanji.planner.providers import OpenAIChatCompletionsProvider

    return OpenAIChatCompletionsProvider(**common)
