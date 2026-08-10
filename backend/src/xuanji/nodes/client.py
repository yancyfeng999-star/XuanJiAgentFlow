from __future__ import annotations

import hashlib
from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, TypeVar
from urllib.parse import quote

import httpx
from pydantic import BaseModel, ValidationError

from .protocol import (
    NodeArtifactDownload,
    NodeArtifactList,
    NodeArtifactStream,
    NodeHealth,
    NodeLogPage,
    NodeTask,
    TaskDispatch,
)

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

    @property
    def base_url(self) -> str:
        return self._base_url

    def rebinding(self, base_url: str) -> NodeClient:
        """Return a client that talks to a different base URL with the same token.

        Used for per-task SSH tunnel endpoints. Does not share the underlying
        httpx client so tunnel and direct connections stay isolated.
        """
        return NodeClient(base_url, self._token, timeout=self._timeout)

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()

    async def health(self) -> NodeHealth:
        return await self._request("GET", "/v1/health", NodeHealth)

    async def capabilities(self) -> dict[str, Any]:
        return await self._request_json("GET", "/v1/capabilities")

    async def create_task(
        self,
        dispatch: TaskDispatch | str,
        idempotency_key: str | None = None,
    ) -> NodeTask:
        legacy_call = isinstance(dispatch, str)
        if legacy_call:
            if idempotency_key is None:
                raise ValueError("幂等键不能为空")
            dispatch = TaskDispatch(
                idempotency_key=idempotency_key,
                instruction=dispatch,
                project_id="legacy",
                run_id="legacy",
                task_id=idempotency_key,
            )
        created = await self._request(
            "POST",
            "/v1/tasks",
            NodeTask,
            json=dispatch.model_dump(mode="json"),
        )
        return await self.start_task(created.id) if legacy_call and created.status == "queued" else created

    async def upload_input(self, task_id: str, path: str, body: bytes, *, size: int, sha256: str) -> None:
        encoded_path = quote(path, safe="/")
        response = await self._raw_request(
            "PUT",
            f"/v1/tasks/{task_id}/inputs/{encoded_path}",
            content=body,
            headers={
                "Authorization": f"Bearer {self._token}",
                "Content-Type": "application/octet-stream",
                "X-Input-Size": str(size),
                "X-Input-SHA256": sha256,
            },
        )
        try:
            data = response.json()
            if data.get("path") != path or data.get("size") != size or data.get("sha256") != sha256:
                raise ValueError
        except (ValueError, TypeError, AttributeError):
            raise NodeProtocolError("node_protocol_error", "节点返回的输入回执无效") from None

    async def start_task(self, task_id: str) -> NodeTask:
        return await self._request("POST", f"/v1/tasks/{task_id}/start", NodeTask)

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

    async def download_artifact(self, task_id: str, path: str) -> NodeArtifactDownload:
        encoded_path = quote(path, safe="/")
        response = await self._raw_request(
            "GET",
            f"/v1/tasks/{task_id}/artifacts/{encoded_path}",
        )
        try:
            size, expected_sha256 = self._artifact_headers(response)
        except (KeyError, ValueError, TypeError):
            raise NodeProtocolError(
                "node_protocol_error",
                "节点返回的产物无效",
            ) from None
        body = response.content
        if len(body) != size or hashlib.sha256(body).hexdigest() != expected_sha256:
            raise NodeProtocolError("node_protocol_error", "节点返回的产物无效")
        return NodeArtifactDownload(body=body, size=size, sha256=expected_sha256)

    @asynccontextmanager
    async def stream_artifact(
        self,
        task_id: str,
        path: str,
    ) -> AsyncIterator[NodeArtifactStream]:
        encoded_path = quote(path, safe="/")
        request_path = f"/v1/tasks/{task_id}/artifacts/{encoded_path}"
        client = self._client or httpx.AsyncClient()
        owns_client = self._client is None
        try:
            async with client.stream(
                "GET",
                f"{self._base_url}{request_path}",
                headers={"Authorization": f"Bearer {self._token}"},
                timeout=self._timeout,
            ) as response:
                try:
                    response.raise_for_status()
                    size, expected_sha256 = self._artifact_headers(response)
                except (httpx.HTTPError, KeyError, ValueError, TypeError):
                    raise NodeProtocolError(
                        "node_protocol_error",
                        "节点返回的产物无效",
                    ) from None

                async def verified_body() -> AsyncIterator[bytes]:
                    digest = hashlib.sha256()
                    received = 0
                    async for chunk in response.aiter_bytes():
                        received += len(chunk)
                        digest.update(chunk)
                        yield chunk
                    if received != size or digest.hexdigest() != expected_sha256:
                        raise NodeProtocolError(
                            "node_protocol_error",
                            "节点返回的产物无效",
                        )

                yield NodeArtifactStream(
                    body=verified_body(),
                    size=size,
                    sha256=expected_sha256,
                )
        except httpx.TimeoutException:
            raise NodeTimeoutError("node_timeout", "执行节点请求超时") from None
        except httpx.RequestError:
            raise NodeConnectionError("node_connection_error", "无法连接执行节点") from None
        finally:
            if owns_client:
                await client.aclose()

    async def _raw_request(self, method: str, path: str, **kwargs: Any) -> httpx.Response:
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
            response.raise_for_status()
            return response
        except httpx.TimeoutException:
            raise NodeTimeoutError("node_timeout", "执行节点请求超时") from None
        except httpx.RequestError:
            raise NodeConnectionError("node_connection_error", "无法连接执行节点") from None
        except httpx.HTTPStatusError:
            raise NodeProtocolError("node_protocol_error", "执行节点返回了无效响应") from None

    @staticmethod
    def _artifact_headers(response: httpx.Response) -> tuple[int, str]:
        size = int(response.headers["X-Artifact-Size"])
        sha256 = response.headers["X-Artifact-SHA256"]
        if size < 0 or len(sha256) != 64 or any(character not in "0123456789abcdef" for character in sha256):
            raise ValueError("产物响应头无效")
        return size, sha256

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
            raise NodeProtocolError("node_protocol_error", "执行节点返回了无效响应") from None

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
            raise NodeTimeoutError("node_timeout", "执行节点请求超时") from None
        except httpx.RequestError:
            raise NodeConnectionError("node_connection_error", "无法连接执行节点") from None

        try:
            response.raise_for_status()
            data = response.json()
            if not isinstance(data, dict):
                raise TypeError
            return data
        except (httpx.HTTPError, ValueError, TypeError):
            raise NodeProtocolError("node_protocol_error", "执行节点返回了无效响应") from None
