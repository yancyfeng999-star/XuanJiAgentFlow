from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import pytest

from xuanji.domain.enums import NodeKind
from xuanji.domain.models import HermesNode
from xuanji.nodes.tunnels import (
    SshTunnelProvider,
    TunnelError,
    TunnelHostKeyError,
    TunnelProcess,
    build_ssh_tunnel_argv,
    extract_fingerprint,
    is_local_node,
)


def remote_node(**overrides: Any) -> HermesNode:
    data = {
        "id": "node-remote",
        "name": "remote",
        "kind": NodeKind.REMOTE,
        "api_url": "http://127.0.0.1:8642",
        "ssh_host": "remote.test",
        "ssh_port": 22,
        "ssh_user": "ubuntu",
        "ssh_key_path": "/tmp/id_ed25519",
    }
    data.update(overrides)
    return HermesNode.model_validate(data)


def local_node() -> HermesNode:
    return HermesNode.model_validate(
        {
            "id": "node-local",
            "name": "local",
            "kind": NodeKind.LOCAL,
            "api_url": "http://127.0.0.1:9000",
        }
    )


@dataclass
class FakeProcess:
    stdout_data: bytes = b""
    stderr_data: bytes = b""
    exit_after: float | None = None
    exit_code: int = 0
    pid: int | None = 4242
    terminated: bool = False
    killed: bool = False
    _waiters: list[asyncio.Future[int]] = field(default_factory=list)
    _returncode: int | None = None
    _timer: asyncio.Task[None] | None = None

    def __post_init__(self) -> None:
        if self.exit_after is not None:
            self._timer = asyncio.create_task(self._auto_exit())

    @property
    def returncode(self) -> int | None:
        return self._returncode

    async def _auto_exit(self) -> None:
        assert self.exit_after is not None
        await asyncio.sleep(self.exit_after)
        self._finish(self.exit_code)

    def _finish(self, code: int) -> None:
        if self._returncode is not None:
            return
        self._returncode = code
        for waiter in self._waiters:
            if not waiter.done():
                waiter.set_result(code)
        self._waiters.clear()

    async def wait(self) -> int:
        if self._returncode is not None:
            return self._returncode
        loop = asyncio.get_running_loop()
        fut: asyncio.Future[int] = loop.create_future()
        self._waiters.append(fut)
        return await fut

    def terminate(self) -> None:
        self.terminated = True
        self._finish(0)

    def kill(self) -> None:
        self.killed = True
        self._finish(-9)

    async def communicate(self) -> tuple[bytes, bytes]:
        if self._returncode is None:
            await self.wait()
        return self.stdout_data, self.stderr_data


class FakeSpawner:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.queue: list[FakeProcess] = []
        self.spawned: list[FakeProcess] = []

    def enqueue(self, process: FakeProcess) -> None:
        self.queue.append(process)

    async def spawn(self, argv: list[str], *, env: dict[str, str] | None = None) -> TunnelProcess:
        self.calls.append(list(argv))
        assert env is None or "token" not in str(env).lower()
        if self.queue:
            process = self.queue.pop(0)
        else:
            process = FakeProcess()
        self.spawned.append(process)
        return process


@pytest.fixture
def known_hosts(tmp_path: Path) -> Path:
    path = tmp_path / "ssh" / "known_hosts"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("")
    return path


@pytest.mark.asyncio
async def test_open_remote_builds_secure_ssh_argv(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    spawner.enqueue(FakeProcess(exit_after=None))
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.05)

    endpoint = await provider.open("attempt-1", remote_node())

    assert endpoint.owner_id == "attempt-1"
    assert endpoint.base_url.startswith("http://127.0.0.1:")
    assert endpoint.remote_port == 8642
    assert len(spawner.calls) == 1
    argv = spawner.calls[0]
    assert argv[0] == "ssh"
    assert "-N" in argv
    assert "ExitOnForwardFailure=yes" in argv
    assert "StrictHostKeyChecking=yes" in argv
    assert f"UserKnownHostsFile={known_hosts}" in argv
    forward = next(arg for arg in argv if arg.startswith(f"{endpoint.local_port}:127.0.0.1:"))
    assert forward == f"{endpoint.local_port}:127.0.0.1:8642"
    assert "ubuntu@remote.test" in argv
    assert "-i" in argv and "/tmp/id_ed25519" in argv
    secret_blob = " ".join(argv)
    assert "Bearer" not in secret_blob
    assert "token" not in secret_blob.lower() or "id_ed25519" in secret_blob  # key path ok
    assert "secret-token" not in secret_blob


@pytest.mark.asyncio
async def test_local_node_does_not_spawn_process(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner)

    endpoint = await provider.open("attempt-local", local_node())

    assert endpoint.base_url == "http://127.0.0.1:9000"
    assert endpoint.local_port == 9000
    assert spawner.calls == []
    assert is_local_node(local_node()) is True


@pytest.mark.asyncio
async def test_open_failure_host_key_unconfirmed(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    stderr = (
        b"The authenticity of host 'remote.test (1.2.3.4)' can't be established.\n"
        b"ED25519 key fingerprint is SHA256:abcDEF123+/=.\n"
        b"Host key verification failed.\n"
    )
    spawner.enqueue(FakeProcess(exit_after=0.01, exit_code=255, stderr_data=stderr))
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.2)

    with pytest.raises(TunnelHostKeyError) as raised:
        await provider.open("attempt-1", remote_node())

    err = raised.value
    assert err.code == "host_key_unconfirmed"
    assert err.fingerprint == "SHA256:abcDEF123+/="
    assert err.host == "remote.test"
    assert err.extra.get("confirmable") is True
    assert provider.owned_ids == set()


@pytest.mark.asyncio
async def test_open_failure_generic_exit(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    spawner.enqueue(
        FakeProcess(exit_after=0.01, exit_code=1, stderr_data=b"Connection refused\n")
    )
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.2)

    with pytest.raises(TunnelError) as raised:
        await provider.open("attempt-1", remote_node())

    assert raised.value.code == "tunnel_open_failed"
    assert provider.owned_ids == set()


@pytest.mark.asyncio
async def test_close_on_complete_cancels_process(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    process = FakeProcess()
    spawner.enqueue(process)
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.05)

    await provider.open("attempt-1", remote_node())
    await provider.close("attempt-1")

    assert process.terminated is True
    assert provider.owned_ids == set()


@pytest.mark.asyncio
async def test_close_all_on_app_exit_and_orphan_cleanup(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    processes = [FakeProcess(pid=100 + i) for i in range(3)]
    for process in processes:
        spawner.enqueue(process)
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.05)

    for index in range(3):
        await provider.open(f"attempt-{index}", remote_node(id=f"node-{index}"))

    assert provider.owned_ids == {"attempt-0", "attempt-1", "attempt-2"}
    await provider.close_all()
    assert provider.owned_ids == set()
    assert all(process.terminated for process in processes)


@pytest.mark.asyncio
async def test_recovery_rebuilds_dead_tunnel(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    first = FakeProcess(pid=1)
    second = FakeProcess(pid=2)
    spawner.enqueue(first)
    spawner.enqueue(second)
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.05)

    endpoint1 = await provider.open("attempt-1", remote_node())
    first.terminate()  # simulate orphan / process death without explicit close
    await asyncio.sleep(0)  # allow returncode update
    endpoint2 = await provider.open("attempt-1", remote_node())

    assert endpoint1.pid == 1
    assert endpoint2.pid == 2
    assert len(spawner.calls) == 2
    assert provider.peek("attempt-1") is not None


@pytest.mark.asyncio
async def test_reopen_same_owner_reuses_live_tunnel(known_hosts: Path) -> None:
    spawner = FakeSpawner()
    spawner.enqueue(FakeProcess(pid=77))
    provider = SshTunnelProvider(known_hosts_path=known_hosts, spawner=spawner, settle_timeout=0.05)

    first = await provider.open("attempt-1", remote_node())
    second = await provider.open("attempt-1", remote_node())

    assert first == second
    assert len(spawner.calls) == 1


def test_build_ssh_tunnel_argv_flags(tmp_path: Path) -> None:
    argv = build_ssh_tunnel_argv(
        host="h",
        port=2222,
        user="u",
        key_path=None,
        local_port=18080,
        remote_port=8642,
        known_hosts_path=tmp_path / "kh",
    )
    assert argv[:5] == ["ssh", "-N", "-L", "18080:127.0.0.1:8642", "-o"]
    assert "ExitOnForwardFailure=yes" in argv
    assert "StrictHostKeyChecking=yes" in argv
    assert f"UserKnownHostsFile={tmp_path / 'kh'}" in argv
    assert "-p" in argv and "2222" in argv
    assert "u@h" in argv
    assert "-i" not in argv


def test_fingerprint_extraction() -> None:
    text = "ED25519 key fingerprint is SHA256:xyz+abc=.\nHost key verification failed."
    assert extract_fingerprint(text) == "SHA256:xyz+abc="


@pytest.mark.asyncio
async def test_execution_manager_opens_and_closes_tunnel_around_attempt(
    tmp_path: Path,
) -> None:
    """Remote dispatch must open an owned tunnel; terminal state must close it."""
    from contextlib import AsyncExitStack

    from tests.fakes.fake_node import FakeNode, FakeNodeMode
    from xuanji.artifacts.manager import ArtifactManager
    from xuanji.domain.enums import NodeStatus, RunStatus, TaskStatus, WorkflowStatus
    from xuanji.domain.models import Project, Run, Task, Workflow
    from xuanji.execution.manager import ExecutionManager
    from xuanji.nodes import NodeClient
    from xuanji.storage.database import Database
    from xuanji.storage.migrations import migrate
    from xuanji.storage.repositories import NodeRepository, ProjectRepository, RunRepository, WorkflowRepository

    class RecordingTunnels:
        def __init__(self) -> None:
            self.opened: list[str] = []
            self.closed: list[str] = []
            self.closed_all = 0

        async def open(self, owner_id: str, node: HermesNode):
            from xuanji.nodes.tunnels import TunnelEndpoint

            self.opened.append(owner_id)
            return TunnelEndpoint(
                owner_id=owner_id,
                local_host="127.0.0.1",
                local_port=18080,
                remote_host="127.0.0.1",
                remote_port=8642,
                base_url=str(node.api_url).rstrip("/"),
                pid=1,
            )

        async def close(self, owner_id: str) -> None:
            self.closed.append(owner_id)

        async def close_all(self) -> None:
            self.closed_all += 1

    database = Database(tmp_path / "t.db")
    migrate(database)
    artifacts = ArtifactManager(tmp_path / "projects")
    project = Project(id="p1", name="P", root_path=str(tmp_path / "projects" / "p1"))
    ProjectRepository(database).create(project)
    artifacts.create_project(project)
    task = Task(id="t1", workflow_id="w1", title="t1", prompt="go")
    workflow = Workflow(
        id="w1",
        project_id=project.id,
        version=1,
        goal="g",
        status=WorkflowStatus.REVIEWED,
        tasks=[task],
    )
    WorkflowRepository(database).save(workflow)
    run = Run(id="r1", workflow_id=workflow.id)
    RunRepository(database).create(run)
    artifacts.create_run(project.id, run.id, workflow.id)

    async with AsyncExitStack() as stack:
        fake = FakeNode(FakeNodeMode.SUCCESS, delay_polls=0)
        stack.callback(fake.close)
        transport = await stack.enter_async_context(fake.client("http://node.test"))
        client = NodeClient("http://node.test", fake.token, client=transport)
        NodeRepository(database).upsert(
            HermesNode(
                id="node-1",
                name="n",
                kind=NodeKind.REMOTE,
                api_url="http://node.test",
                ssh_host="remote.test",
                status=NodeStatus.ONLINE,
                capabilities_json={"models": ["fake-model"], "tools": ["terminal"], "tags": ["fake"]},
                max_concurrency=1,
            )
        )
        tunnels = RecordingTunnels()
        manager = ExecutionManager(
            database,
            artifacts,
            {"node-1": client},
            poll_interval=60.0,
            tunnels=tunnels,  # type: ignore[arg-type]
        )
        stack.push_async_callback(manager.close)

        await manager.start(run.id)
        attempts = RunRepository(database).latest_attempts(run.id)
        assert "t1" in attempts
        attempt_id = attempts["t1"].id
        assert attempt_id in tunnels.opened

        # Drive to completion.
        for _ in range(5):
            await manager.step(run.id)
            if RunRepository(database).get(run.id).status is RunStatus.SUCCESS:
                break
            await asyncio.sleep(0.01)

        await asyncio.sleep(0.05)  # allow background tunnel close task
        assert attempt_id in tunnels.closed
        assert RunRepository(database).latest_attempts(run.id)["t1"].status is TaskStatus.SUCCESS

        await manager.close()
        assert tunnels.closed_all >= 1
