from __future__ import annotations

from typing import Protocol

import httpx

from xuanji.credentials import LocalCredentialStore


class PlannerError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class PlannerProvider(Protocol):
    async def complete(self, messages: list[dict[str, str]], model: str) -> str: ...


class OpenAIChatCompletionsProvider:
    def __init__(
        self,
        *,
        base_url: str,
        credential_store: LocalCredentialStore,
        credential_key: str,
        client: httpx.AsyncClient | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ):
        if client is not None and transport is not None:
            raise ValueError("客户端与传输适配器不能同时配置")
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._credentials = credential_store
        self._credential_key = credential_key
        self._client = client
        self._transport = transport
        self._timeout = timeout

    async def complete(self, messages: list[dict[str, str]], model: str, *, reasoning_effort: str | None = None) -> str:
        api_key = self._credentials.get(self._credential_key)
        if not api_key:
            raise PlannerError("planner_credentials_missing", "思考模型接口密钥尚未配置")

        request = {
            "headers": {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            "json": {
                "messages": messages,
                "model": model,
                "response_format": {"type": "json_object"},
            },
        }
        try:
            if self._client is not None:
                response = await self._client.post(self._url, **request)
            else:
                async with httpx.AsyncClient(
                    transport=self._transport,
                    timeout=self._timeout,
                ) as client:
                    response = await client.post(self._url, **request)
        except httpx.TimeoutException:
            raise PlannerError("planner_timeout", "思考模型服务请求超时") from None
        except httpx.RequestError:
            raise PlannerError("planner_provider_error", "思考模型服务请求失败") from None

        if response.status_code == 401:
            raise PlannerError(
                "planner_unauthorized",
                "思考模型身份验证失败，请检查接口密钥",
            )
        try:
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("思考模型返回内容必须是文本")
            return content
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            raise PlannerError("planner_provider_error", "思考模型服务请求失败") from None
