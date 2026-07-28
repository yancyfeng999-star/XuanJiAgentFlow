from __future__ import annotations

from typing import Any, TypeVar

import httpx
from pydantic import BaseModel, ValidationError

from .protocol import NodeArtifactList, NodeHealth, NodeLogPage, NodeTask

Message = TypeVar("Message", bound=BaseModel)


class NodeClientError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


class NodeTimeoutError(NodeClientError):
    pass


class NodeConnectionError(NodeClientError):
    pass


class NodeProtocolError(NodeClientError):
    pass


class NodeClient:
    def __init__(
        self,
        base_url: str,
        token: str,
        *,
        client: httpx.AsyncClient | None = None,
        timeout: float = 30.0,
    ):
        self._base_url = base_url.rstrip("/")
        self._token = token
        self._client = client
        self._timeout = timeout

    def __repr__(self) -> str:
        return f"NodeClient(base_url={self._base_url!r})"

    async def health(self) -> NodeHealth:
        return await self._request("GET", "/v1/health", NodeHealth)

    async def capabilities(self) -> dict[str, Any]:
        return await self._request_json("GET", "/v1/capabilities")

    async def create_task(self, goal: str, idempotency_key: str) -> NodeTask:
        return await self._request(
            "POST",
            "/v1/tasks",
            NodeTask,
            json={"goal": goal, "idempotency_key": idempotency_key},
        )

    async def get_task(self, task_id: str) -> NodeTask:
        return await self._request("GET", f"/v1/tasks/{task_id}", NodeTask)

    async def cancel_task(self, task_id: str) -> NodeTask:
        return await self._request("POST", f"/v1/tasks/{task_id}/cancel", NodeTask)

    async def logs(self, task_id: str, offset: int = 0) -> NodeLogPage:
        return await self._request(
            "GET",
            f"/v1/tasks/{task_id}/logs",
            NodeLogPage,
            params={"offset": offset},
        )

    async def artifacts(self, task_id: str) -> NodeArtifactList:
        return await self._request("GET", f"/v1/tasks/{task_id}/artifacts", NodeArtifactList)

    async def _request(
        self,
        method: str,
        path: str,
        model: type[Message],
        **kwargs: Any,
    ) -> Message:
        data = await self._request_json(method, path, **kwargs)
        try:
            return model.model_validate(data)
        except ValidationError:
            raise NodeProtocolError("node_protocol_error", "node returned an invalid response") from None

    async def _request_json(self, method: str, path: str, **kwargs: Any) -> dict[str, Any]:
        request = {
            "headers": {"Authorization": f"Bearer {self._token}"},
            "timeout": self._timeout,
            **kwargs,
        }
        try:
            if self._client is not None:
                response = await self._client.request(method, f"{self._base_url}{path}", **request)
            else:
                async with httpx.AsyncClient() as client:
                    response = await client.request(method, f"{self._base_url}{path}", **request)
        except httpx.TimeoutException:
            raise NodeTimeoutError("node_timeout", "node request timed out") from None
        except httpx.RequestError:
            raise NodeConnectionError("node_connection_error", "node connection failed") from None

        try:
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise TypeError
            return data
        except (httpx.HTTPError, ValueError, TypeError):
            raise NodeProtocolError("node_protocol_error", "node returned an invalid response") from None
