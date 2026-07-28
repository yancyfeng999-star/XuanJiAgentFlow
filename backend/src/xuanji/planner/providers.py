from __future__ import annotations

from typing import Protocol

import httpx

from xuanji.security import CredentialVault


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
        credential_vault: CredentialVault,
        credential_key: str,
        client: httpx.AsyncClient | None = None,
        transport: httpx.AsyncBaseTransport | None = None,
        timeout: float = 120.0,
    ):
        if client is not None and transport is not None:
            raise ValueError("client and transport are mutually exclusive")
        self._url = f"{base_url.rstrip('/')}/chat/completions"
        self._vault = credential_vault
        self._credential_key = credential_key
        self._client = client
        self._transport = transport
        self._timeout = timeout

    async def complete(self, messages: list[dict[str, str]], model: str) -> str:
        api_key = self._vault.get(self._credential_key)
        if not api_key:
            raise PlannerError("planner_credentials_missing", "planner credentials are not configured")

        request = {
            "headers": {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            "json": {"messages": messages, "model": model},
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
            raise PlannerError("planner_timeout", "planner provider timed out") from None
        except httpx.RequestError:
            raise PlannerError("planner_provider_error", "planner provider request failed") from None

        if response.status_code == 401:
            raise PlannerError(
                "planner_unauthorized",
                "planner provider rejected credentials",
            )
        try:
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            if not isinstance(content, str):
                raise TypeError("planner content must be text")
            return content
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError):
            raise PlannerError("planner_provider_error", "planner provider request failed") from None
