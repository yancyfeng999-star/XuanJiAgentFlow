from __future__ import annotations

import asyncio
import logging
import re
import socket
from dataclasses import dataclass, field
from pathlib import Path
from typing import Protocol
from urllib.parse import urlparse

from xuanji.domain.enums import NodeKind
from xuanji.domain.models import HermesNode

logger = logging.getLogger(__name__)

_FINGERPRINT_RE = re.compile(
    r"(?:SHA256|MD5):[A-Za-z0-9+/=:_-]+",
    re.IGNORECASE,
)
_HOST_KEY_MARKERS = (
    "host key verification failed",
    "no ed25519 host key is known",
    "no ecdsa host key is known",
    "no rsa host key is known",
    "the authenticity of host",
    "are you sure you want to continue connecting",
)


class TunnelError(Exception):
    def __init__(self, code: str, message: str, **extra: object) -> None:
        super().__init__(message)
        self.code = code
        self.extra = extra


class TunnelHostKeyError(TunnelError):
    def __init__(
        self,
        message: str,
        *,
        host: str,
        fingerprint: str | None = None,
        stderr: str = "",
    ) -> None:
        super().__init__(
            "host_key_unconfirmed",
            message,
            host=host,
            fingerprint=fingerprint,
            confirmable=True,
        )
        self.host = host
        self.fingerprint = fingerprint
        self.stderr = stderr


@dataclass(frozen=True)
class TunnelEndpoint:
    owner_id: str
    local_host: str
    local_port: int
    remote_host: str
    remote_port: int
    base_url: str
    pid: int | None = None


class TunnelProcess(Protocol):
    @property
    def pid(self) -> int | None: ...

    @property
    def returncode(self) -> int | None: ...

    async def wait(self) -> int: ...

    def terminate(self) -> None: ...

    def kill(self) -> None: ...

    async def communicate(self) -> tuple[bytes, bytes]: ...


class ProcessSpawner(Protocol):
    async def spawn(self, argv: list[str], *, env: dict[str, str] | None = None) -> TunnelProcess: ...


@dataclass
class _OwnedTunnel:
    endpoint: TunnelEndpoint
    process: TunnelProcess | None
    argv: list[str] = field(default_factory=list)


class TunnelProvider(Protocol):
    async def open(self, owner_id: str, node: HermesNode) -> TunnelEndpoint: ...

    async def close(self, owner_id: str) -> None: ...

    async def close_all(self) -> None: ...


def allocate_local_port(host: str = "127.0.0.1") -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def remote_api_port(node: HermesNode, default: int = 8642) -> int:
    parsed = urlparse(str(node.api_url))
    if parsed.port is not None:
        return parsed.port
    if parsed.scheme == "https":
        return 443
    if parsed.scheme == "http":
        return 80
    return default


def is_local_node(node: HermesNode) -> bool:
    if node.kind is NodeKind.LOCAL:
        return True
    return not node.ssh_host


def extract_fingerprint(text: str) -> str | None:
    match = _FINGERPRINT_RE.search(text)
    return match.group(0) if match else None


def is_host_key_failure(stderr: str) -> bool:
    lowered = stderr.lower()
    return any(marker in lowered for marker in _HOST_KEY_MARKERS)


def build_ssh_tunnel_argv(
    *,
    host: str,
    port: int,
    user: str,
    key_path: str | None,
    local_port: int,
    remote_port: int,
    known_hosts_path: Path | str,
) -> list[str]:
    argv = [
        "ssh",
        "-N",
        "-L",
        f"{local_port}:127.0.0.1:{remote_port}",
        "-o",
        "ExitOnForwardFailure=yes",
        "-o",
        "StrictHostKeyChecking=yes",
        "-o",
        f"UserKnownHostsFile={known_hosts_path}",
        "-o",
        "BatchMode=yes",
        "-o",
        "ConnectTimeout=10",
        "-p",
        str(port),
    ]
    if key_path:
        argv.extend(["-i", key_path])
    argv.append(f"{user}@{host}")
    # Never put tokens in argv. Node tokens travel over the established HTTP tunnel only.
    return argv


class AsyncioProcessSpawner:
    async def spawn(self, argv: list[str], *, env: dict[str, str] | None = None) -> TunnelProcess:
        process = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            stdin=asyncio.subprocess.DEVNULL,
            env=env,
        )
        return process  # type: ignore[return-value]


class SshTunnelProvider:
    """Owned per-task SSH local port forwards for remote Node Agents."""

    def __init__(
        self,
        *,
        known_hosts_path: Path | str,
        spawner: ProcessSpawner | None = None,
        settle_timeout: float = 0.75,
        local_host: str = "127.0.0.1",
    ) -> None:
        self.known_hosts_path = Path(known_hosts_path)
        self.known_hosts_path.parent.mkdir(parents=True, exist_ok=True)
        if not self.known_hosts_path.exists():
            self.known_hosts_path.touch()
        self._spawner = spawner or AsyncioProcessSpawner()
        self._settle_timeout = settle_timeout
        self._local_host = local_host
        self._tunnels: dict[str, _OwnedTunnel] = {}
        self._lock = asyncio.Lock()

    @property
    def owned_ids(self) -> set[str]:
        return set(self._tunnels)

    def peek(self, owner_id: str) -> TunnelEndpoint | None:
        owned = self._tunnels.get(owner_id)
        return owned.endpoint if owned else None

    async def open(self, owner_id: str, node: HermesNode) -> TunnelEndpoint:
        if not owner_id:
            raise TunnelError("invalid_owner", "隧道所属任务 ID 不能为空")
        async with self._lock:
            existing = self._tunnels.get(owner_id)
            if existing is not None:
                process = existing.process
                if process is None or process.returncode is None:
                    return existing.endpoint
                # Process died — rebuild below after cleanup.
                await self._terminate(existing)
                self._tunnels.pop(owner_id, None)

            if is_local_node(node):
                endpoint = self._local_endpoint(owner_id, node)
                self._tunnels[owner_id] = _OwnedTunnel(endpoint=endpoint, process=None)
                return endpoint

            if not node.ssh_host:
                raise TunnelError("ssh_not_configured", f"节点 {node.id} 尚未配置远程连接主机")

            local_port = allocate_local_port(self._local_host)
            remote_port = remote_api_port(node)
            argv = build_ssh_tunnel_argv(
                host=node.ssh_host,
                port=node.ssh_port or 22,
                user=node.ssh_user or "root",
                key_path=node.ssh_key_path,
                local_port=local_port,
                remote_port=remote_port,
                known_hosts_path=self.known_hosts_path,
            )
            self._assert_no_secrets(argv)

            logger.info(
                "opening ssh tunnel owner=%s host=%s local_port=%s remote_port=%s",
                owner_id,
                node.ssh_host,
                local_port,
                remote_port,
            )
            process = await self._spawner.spawn(argv)
            endpoint = TunnelEndpoint(
                owner_id=owner_id,
                local_host=self._local_host,
                local_port=local_port,
                remote_host="127.0.0.1",
                remote_port=remote_port,
                base_url=f"http://{self._local_host}:{local_port}",
                pid=process.pid,
            )
            try:
                await self._wait_until_ready(process, host=node.ssh_host)
            except Exception:
                await self._terminate_process(process)
                raise

            self._tunnels[owner_id] = _OwnedTunnel(endpoint=endpoint, process=process, argv=argv)
            return endpoint

    async def close(self, owner_id: str) -> None:
        async with self._lock:
            owned = self._tunnels.pop(owner_id, None)
            if owned is None:
                return
            await self._terminate(owned)
            logger.info("closed ssh tunnel owner=%s", owner_id)

    async def close_all(self) -> None:
        async with self._lock:
            owners = list(self._tunnels.items())
            self._tunnels.clear()
            for owner_id, owned in owners:
                await self._terminate(owned)
                logger.info("closed ssh tunnel owner=%s", owner_id)

    def _local_endpoint(self, owner_id: str, node: HermesNode) -> TunnelEndpoint:
        parsed = urlparse(str(node.api_url))
        host = parsed.hostname or "127.0.0.1"
        port = remote_api_port(node)
        return TunnelEndpoint(
            owner_id=owner_id,
            local_host=host,
            local_port=port,
            remote_host=host,
            remote_port=port,
            base_url=str(node.api_url).rstrip("/"),
            pid=None,
        )

    async def _wait_until_ready(self, process: TunnelProcess, *, host: str) -> None:
        try:
            await asyncio.wait_for(process.wait(), timeout=self._settle_timeout)
        except asyncio.TimeoutError:
            # Still running after settle window — treat as established.
            if process.returncode is None:
                return
        # Process exited during settle window → capture stderr and classify.
        stdout, stderr = await process.communicate()
        text = (stderr or b"").decode("utf-8", errors="replace") + (stdout or b"").decode(
            "utf-8", errors="replace"
        )
        if is_host_key_failure(text):
            fingerprint = extract_fingerprint(text)
            raise TunnelHostKeyError(
                "远程连接主机指纹未知或已变化，请确认指纹后继续",
                host=host,
                fingerprint=fingerprint,
                stderr=text[-2000:],
            )
        raise TunnelError(
            "tunnel_open_failed",
            f"远程连接通道在建立过程中退出（退出码：{process.returncode}）",
            host=host,
            stderr=text[-2000:],
        )

    async def _terminate(self, owned: _OwnedTunnel) -> None:
        if owned.process is not None:
            await self._terminate_process(owned.process)

    async def _terminate_process(self, process: TunnelProcess) -> None:
        if process.returncode is not None:
            return
        try:
            process.terminate()
        except ProcessLookupError:
            return
        try:
            await asyncio.wait_for(process.wait(), timeout=2.0)
        except asyncio.TimeoutError:
            try:
                process.kill()
            except ProcessLookupError:
                return
            try:
                await asyncio.wait_for(process.wait(), timeout=1.0)
            except asyncio.TimeoutError:
                return

    @staticmethod
    def _assert_no_secrets(argv: list[str]) -> None:
        joined = " ".join(argv).lower()
        for forbidden in ("bearer ", "authorization:", "api_key=", "token="):
            if forbidden in joined:
                raise TunnelError("secret_in_argv", "远程连接通道启动参数中不能包含凭据")


class NoopTunnelProvider:
    """Passthrough provider used when tunnels are disabled (all local / tests)."""

    def __init__(self) -> None:
        self._endpoints: dict[str, TunnelEndpoint] = {}

    async def open(self, owner_id: str, node: HermesNode) -> TunnelEndpoint:
        if owner_id in self._endpoints:
            return self._endpoints[owner_id]
        parsed = urlparse(str(node.api_url))
        host = parsed.hostname or "127.0.0.1"
        port = remote_api_port(node)
        endpoint = TunnelEndpoint(
            owner_id=owner_id,
            local_host=host,
            local_port=port,
            remote_host=host,
            remote_port=port,
            base_url=str(node.api_url).rstrip("/"),
            pid=None,
        )
        self._endpoints[owner_id] = endpoint
        return endpoint

    async def close(self, owner_id: str) -> None:
        self._endpoints.pop(owner_id, None)

    async def close_all(self) -> None:
        self._endpoints.clear()
