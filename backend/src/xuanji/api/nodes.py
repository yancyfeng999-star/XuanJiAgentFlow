from __future__ import annotations

import asyncio
import shutil
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from xuanji.domain.enums import NodeStatus
from xuanji.domain.models import HermesNode
from xuanji.nodes import NodeClientError
from xuanji.provisioning import SSHHost
from xuanji.provisioning.ssh import provisioning_succeeded
from .errors import APIError

router = APIRouter(prefix="/api/nodes", tags=["nodes"])


class CreateNodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1, pattern=r"^[A-Za-z0-9._-]+$")
    name: str = Field(min_length=1)
    kind: str
    api_url: str
    ssh_host: str | None = None
    ssh_port: int | None = None
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    status: str = "unknown"
    capabilities_json: dict[str, Any] = Field(default_factory=dict)
    max_concurrency: int = Field(default=1, ge=1)
    running_tasks: int = Field(default=0, ge=0)
    success_rate: float = Field(default=1.0, ge=0, le=1)
    credential: str | None = None

    @field_validator("id")
    @classmethod
    def reject_dot_segments(cls, value: str) -> str:
        if value in {".", ".."}:
            raise ValueError("节点 ID 不能使用点路径片段")
        return value


class UpdateNodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = Field(default=None, min_length=1)
    api_url: str | None = None
    ssh_host: str | None = None
    ssh_port: int | None = None
    ssh_user: str | None = None
    ssh_key_path: str | None = None
    status: str | None = None
    capabilities_json: dict[str, Any] | None = None
    max_concurrency: int | None = Field(default=None, ge=1)
    credential: str | None = None


class ProvisionNodeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hermes_port: int = Field(default=8642, ge=1, le=65535)


def _services(request: Request):
    return request.app.state.services


def _node(request: Request, node_id: str) -> HermesNode:
    node = _services(request).nodes.get(node_id)
    if node is None:
        raise APIError(404, "node_not_found", "执行节点不存在", {"node_id": node_id})
    return node


def _response(request: Request, node: HermesNode) -> dict:
    services = _services(request)
    configured = services.credentials.get(services.node_credential_key(node.id)) is not None
    return {**node.model_dump(mode="json"), "credential_configured": configured}


async def _configure_client(request: Request, node: HermesNode, credential: str | None) -> None:
    services = _services(request)
    if credential is not None:
        services.credentials.set(services.node_credential_key(node.id), credential)
    await services.install_node_client(node, credential)


async def _diagnose(request: Request, node: HermesNode) -> tuple[HermesNode, dict]:
    services = _services(request)
    client = services.node_clients.get(node.id)
    if client is None:
        raise APIError(
            503,
            "node_client_unavailable",
            "节点客户端当前不可用",
            {"node_id": node.id},
        )
    try:
        health = await client.health()
        capabilities = await client.capabilities()
    except NodeClientError:
        offline = node.model_copy(
            update={"status": NodeStatus.OFFLINE, "last_seen_at": datetime.now(timezone.utc)}
        )
        services.nodes.upsert(offline)
        raise
    diagnosed = node.model_copy(
        update={
            "status": NodeStatus.ONLINE if health.status == "ok" else NodeStatus.DEGRADED,
            "capabilities_json": capabilities,
            "last_seen_at": datetime.now(timezone.utc),
        }
    )
    services.nodes.upsert(diagnosed)
    return diagnosed, {
        "health": health.model_dump(mode="json"),
        "capabilities": capabilities,
        "node": _response(request, diagnosed),
    }


@router.get("")
async def list_nodes(request: Request) -> list[dict]:
    return [_response(request, node) for node in _services(request).nodes.list()]


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_node(payload: CreateNodeRequest, request: Request) -> dict:
    node = HermesNode.model_validate(payload.model_dump(exclude={"credential"}))
    services = _services(request)
    services.nodes.upsert(node)
    try:
        await _configure_client(request, node, payload.credential)
    except Exception:
        services.nodes.delete(node.id)
        raise
    try:
        node, _ = await _diagnose(request, node)
    except (NodeClientError, APIError):
        node = services.nodes.get(node.id) or node
    return _response(request, node)


@router.patch("/{node_id}")
async def update_node(node_id: str, payload: UpdateNodeRequest, request: Request) -> dict:
    node = _node(request, node_id)
    updates = payload.model_dump(exclude_none=True, exclude={"credential"})
    updated = HermesNode.model_validate(node.model_copy(update=updates).model_dump())
    services = _services(request)
    services.nodes.upsert(updated)
    await _configure_client(request, updated, payload.credential)
    return _response(request, updated)


@router.delete("/{node_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_node(node_id: str, request: Request) -> Response:
    _node(request, node_id)
    services = _services(request)
    services.nodes.delete(node_id)
    await services.remove_node_client(node_id)
    services.credentials.delete(services.node_credential_key(node_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{node_id}/diagnose")
async def diagnose_node(node_id: str, request: Request) -> dict:
    _, result = await _diagnose(request, _node(request, node_id))
    return result


@router.post("/{node_id}/provision")
async def provision_node(
    node_id: str,
    payload: ProvisionNodeRequest,
    request: Request,
) -> dict:
    node = _node(request, node_id)
    if node.kind.value != "remote" or not node.ssh_host:
        raise APIError(
            422,
            "node_not_remote",
            "该节点未配置远程连接信息",
            {"node_id": node_id},
        )
    services = _services(request)
    api_key = services.credentials.get(services.node_credential_key(node_id)) or ""
    host = SSHHost(
        host=node.ssh_host,
        port=node.ssh_port or 22,
        user=node.ssh_user or "root",
        key_path=node.ssh_key_path,
    )
    steps = await asyncio.to_thread(
        services.provisioning.provision_remote,
        host,
        api_key,
        payload.hermes_port,
    )
    return {
        "node_id": node_id,
        "completed": provisioning_succeeded(steps),
        "steps": steps,
    }


@router.post("/local/discover")
async def discover_local() -> dict:
    executable = shutil.which("hermes")
    return {"found": executable is not None, "path": executable, "version": None}
