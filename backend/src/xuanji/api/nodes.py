from __future__ import annotations

import asyncio
import shutil
import socket
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from xuanji.domain.enums import NodeStatus
from xuanji.domain.models import HermesNode
from xuanji.nodes import NodeClientError
from xuanji.provisioning import SSHHost
from xuanji.provisioning.ssh import (
    HostKeyError,
    known_host_entries,
    provisioning_succeeded,
    record_host_key,
    scan_host_keys,
)
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


class HostKeyConfirmRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    algorithm: str = Field(min_length=1)
    fingerprint: str = Field(min_length=1)


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


def _step(step: str, status: str, message: str = "") -> dict[str, str]:
    return {"step": step, "status": status, "message": message}


async def _diagnose(request: Request, node: HermesNode) -> tuple[HermesNode, dict]:
    services = _services(request)
    steps: list[dict[str, str]] = []
    parsed = urlparse(str(node.api_url))
    host = parsed.hostname or ""
    port = parsed.port or (443 if parsed.scheme == "https" else 80)

    try:
        await asyncio.to_thread(socket.getaddrinfo, host, None)
        steps.append(_step("dns", "ok", host))
    except OSError as error:
        steps.append(_step("dns", "failed", str(error)))

    if steps[-1]["status"] == "ok":
        try:
            reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=5)
            writer.close()
            await writer.wait_closed()
            steps.append(_step("tcp", "ok", f"{host}:{port}"))
        except (OSError, asyncio.TimeoutError) as error:
            steps.append(_step("tcp", "failed", str(error) or "连接超时"))
    else:
        steps.append(_step("tcp", "skipped", "DNS 未解析"))

    if node.kind.value == "remote" and node.ssh_host:
        from xuanji.provisioning.ssh import SSHRunner

        runner = SSHRunner(
            SSHHost(
                host=node.ssh_host,
                port=node.ssh_port or 22,
                user=node.ssh_user or "root",
                key_path=node.ssh_key_path,
            ),
            known_hosts_path=services.config.known_hosts_path,
        )
        try:
            code, _, stderr = await asyncio.to_thread(runner.run, "true", 15)
            if code == 0:
                steps.append(_step("ssh", "ok", f"{node.ssh_user or 'root'}@{node.ssh_host}"))
            else:
                steps.append(_step("ssh", "failed", stderr.strip() or f"退出码 {code}"))
        except Exception as error:
            steps.append(_step("ssh", "failed", str(error)))
    else:
        steps.append(_step("ssh", "skipped", "本机节点无需 SSH"))

    client = services.node_clients.get(node.id)
    agent_error: str | None = None
    health = None
    capabilities: dict[str, Any] | None = None
    if client is None:
        agent_error = "节点客户端当前不可用"
        steps.append(_step("node_agent", "failed", agent_error))
        steps.append(_step("hermes", "skipped", "Node Agent 不可用"))
    else:
        try:
            health = await client.health()
            steps.append(_step("node_agent", "ok", health.status))
        except NodeClientError as error:
            agent_error = str(error)
            steps.append(_step("node_agent", "failed", str(error)))
            steps.append(_step("hermes", "skipped", "Node Agent 不可用"))
        else:
            try:
                capabilities = await client.capabilities()
                steps.append(_step("hermes", "ok", "能力上报正常"))
            except NodeClientError as error:
                agent_error = str(error)
                steps.append(_step("hermes", "failed", str(error)))

    if agent_error is not None or health is None or capabilities is None:
        layer = next((s["step"] for s in steps if s["status"] == "failed"), "node_agent")
        return _diagnose_failure(request, node, steps, layer)

    connectivity_failed = any(
        step["status"] == "failed" and step["step"] in {"node_agent", "hermes", "ssh"}
        for step in steps
    )
    degraded = health.status != "ok" or connectivity_failed
    diagnosed = node.model_copy(
        update={
            "status": NodeStatus.DEGRADED if degraded else NodeStatus.ONLINE,
            "capabilities_json": capabilities,
            "last_seen_at": datetime.now(timezone.utc),
        }
    )
    services.nodes.upsert(diagnosed)
    return diagnosed, {
        "health": health.model_dump(mode="json"),
        "capabilities": capabilities,
        "steps": steps,
        "node": _response(request, diagnosed),
    }


def _diagnose_failure(request: Request, node: HermesNode, steps: list[dict[str, str]], layer: str):
    services = _services(request)
    offline = node.model_copy(
        update={"status": NodeStatus.OFFLINE, "last_seen_at": datetime.now(timezone.utc)}
    )
    services.nodes.upsert(offline)
    raise APIError(
        503,
        "node_diagnose_failed",
        "节点诊断失败",
        {"node_id": node.id, "layer": layer, "steps": steps, "node": _response(request, offline)},
    )


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


def _ssh_target(node: HermesNode) -> tuple[str, int]:
    if node.kind.value != "remote" or not node.ssh_host:
        raise APIError(
            422,
            "node_not_remote",
            "该节点未配置远程连接信息",
            {"node_id": node.id},
        )
    return node.ssh_host, node.ssh_port or 22


@router.post("/{node_id}/host-key/inspect")
async def inspect_host_key(node_id: str, request: Request) -> dict:
    node = _node(request, node_id)
    host, port = _ssh_target(node)
    services = _services(request)
    try:
        keys = await asyncio.to_thread(scan_host_keys, host, port)
    except HostKeyError as error:
        raise APIError(502, error.code, error.message, {"node_id": node_id}) from None
    known = await asyncio.to_thread(known_host_entries, host, port, services.config.known_hosts_path)
    return {
        "node_id": node_id,
        "host": host,
        "port": port,
        "keys": [
            {
                "algorithm": key["algorithm"],
                "fingerprint": key["fingerprint"],
                "known": " ".join(key["line"].split()[-2:]) in known,
            }
            for key in keys
        ],
    }


@router.post("/{node_id}/host-key/confirm")
async def confirm_host_key(node_id: str, payload: HostKeyConfirmRequest, request: Request) -> dict:
    node = _node(request, node_id)
    host, port = _ssh_target(node)
    services = _services(request)
    # 重新扫描而不是复用 inspect 结果：确认时必须绑定当下测得的指纹，防止竞态替换
    try:
        fresh = await asyncio.to_thread(scan_host_keys, host, port)
    except HostKeyError as error:
        raise APIError(502, error.code, error.message, {"node_id": node_id}) from None
    match = next((key for key in fresh if key["algorithm"] == payload.algorithm), None)
    if match is None:
        raise APIError(
            409,
            "host_key_changed",
            "主机密钥算法已变化，请重新检查指纹",
            {"node_id": node_id, "algorithm": payload.algorithm},
        )
    if match["fingerprint"] != payload.fingerprint:
        raise APIError(
            409,
            "host_key_changed",
            "主机指纹与确认时不一致，已拒绝写入",
            {"node_id": node_id, "algorithm": payload.algorithm},
        )
    await asyncio.to_thread(record_host_key, services.config.known_hosts_path, match["line"])
    return {
        "node_id": node_id,
        "host": host,
        "port": port,
        "algorithm": match["algorithm"],
        "fingerprint": match["fingerprint"],
        "recorded": True,
    }


@router.post("/local/discover")
async def discover_local() -> dict:
    executable = shutil.which("hermes")
    return {"found": executable is not None, "path": executable, "version": None}
