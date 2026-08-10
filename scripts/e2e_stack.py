#!/usr/bin/env python3
"""Launch a repeatable web+backend E2E stack with Fake multi-node servers.

Starts:
  1. Two FakeNode HTTP servers (real local HTTP, protocol-faithful)
  2. Coordinator API with MockPlanner and wired NodeClients
  3. Emits COORDINATOR_URL / E2E_STACK_READY and writes .e2e/stack.json

Used by Playwright (`npm run test:e2e`) and scripts/verify-all.sh.
"""

from __future__ import annotations

import argparse
import json
import signal
import socket
import sys
import tempfile
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND_SRC = ROOT / "backend" / "src"
BACKEND_TESTS = ROOT / "backend"
for path in (str(BACKEND_SRC), str(BACKEND_TESTS)):
    if path not in sys.path:
        sys.path.insert(0, path)


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_port_open(port: int, timeout: float = 15.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.settimeout(0.2)
            try:
                sock.connect(("127.0.0.1", port))
                return
            except OSError:
                time.sleep(0.02)
    raise RuntimeError(f"port {port} did not open")


def wait_http(url: str, timeout: float = 15.0) -> None:
    import httpx

    deadline = time.monotonic() + timeout
    last: Exception | None = None
    while time.monotonic() < deadline:
        try:
            response = httpx.get(url, timeout=0.5)
            if response.status_code < 500:
                return
        except Exception as exc:  # noqa: BLE001 — readiness poll
            last = exc
        time.sleep(0.05)
    raise RuntimeError(f"service not ready: {url} last={last}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="e2e-stack")
    parser.add_argument("--coordinator-port", type=int, default=0)
    parser.add_argument("--node-count", type=int, default=2)
    parser.add_argument("--data-dir", type=Path, default=None)
    parser.add_argument("--state-file", type=Path, default=None)
    parser.add_argument("--poll-interval", type=float, default=0.05)
    parser.add_argument("--keep-alive", action="store_true", default=True)
    args = parser.parse_args(argv)

    import httpx
    import uvicorn

    from tests.fakes.fake_node import FakeNode, FakeNodeMode
    from xuanji.api.app import CoordinatorConfig, create_coordinator_app
    from xuanji.domain.enums import WorkflowStatus
    from xuanji.domain.models import Task, Workflow
    from xuanji.nodes import NodeClient

    class MockPlanner:
        """Returns a small multi-task DAG suitable for Fake multi-node execution."""

        async def plan(self, project_id: str, goal: str, context: str, constraints: dict) -> Workflow:
            workflow_id = f"workflow-{project_id}-{int(time.time() * 1000)}"
            return Workflow(
                id=workflow_id,
                project_id=project_id,
                version=1,
                goal=goal,
                status=WorkflowStatus.DRAFT,
                planner_provider="e2e-mock",
                planner_model="e2e-model",
                tasks=[
                    Task(
                        id="research",
                        workflow_id=workflow_id,
                        title="资料研究",
                        prompt=f"围绕以下目标收集并核实资料：{goal}\n补充背景：{context}",
                        ui_position={"x": 80, "y": 80},
                    ),
                    Task(
                        id="analyze",
                        workflow_id=workflow_id,
                        title="分析整理",
                        prompt=f"分析已核实的输入资料并提炼与目标相关的结论：{goal}",
                        ui_position={"x": 80, "y": 240},
                    ),
                    Task(
                        id="write",
                        workflow_id=workflow_id,
                        title="撰写报告",
                        prompt="根据已核实的资料和分析结论撰写最终报告。",
                        dependencies=["research", "analyze"],
                        ui_position={"x": 360, "y": 160},
                    ),
                ],
            )

    state_file = (args.state_file or (ROOT / ".e2e" / "stack.json")).resolve()
    state_file.parent.mkdir(parents=True, exist_ok=True)
    data_dir = (args.data_dir or Path(tempfile.mkdtemp(prefix="xuanji-e2e-"))).resolve()
    data_dir.mkdir(parents=True, exist_ok=True)

    fakes: list[FakeNode] = []
    node_servers: list[uvicorn.Server] = []
    node_threads: list[threading.Thread] = []
    node_clients: dict[str, NodeClient] = {}
    node_urls: dict[str, str] = {}
    tokens: dict[str, str] = {}

    for index in range(1, args.node_count + 1):
        node_id = f"node-{index}"
        port = free_port()
        token = f"e2e-token-{index}"
        fake = FakeNode(FakeNodeMode.SUCCESS, token=token)
        fakes.append(fake)
        config = uvicorn.Config(
            fake.app,
            host="127.0.0.1",
            port=port,
            log_level="warning",
            access_log=False,
        )
        server = uvicorn.Server(config)
        server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
        thread = threading.Thread(target=server.run, name=f"fake-{node_id}", daemon=True)
        thread.start()
        node_servers.append(server)
        node_threads.append(thread)
        base_url = f"http://127.0.0.1:{port}"
        node_urls[node_id] = base_url
        tokens[node_id] = token
        wait_port_open(port)
        node_clients[node_id] = NodeClient(base_url, token)

    def node_client_factory(base_url: str, token: str) -> NodeClient:
        return NodeClient(base_url, token)

    coordinator_port = args.coordinator_port or free_port()
    app = create_coordinator_app(
        CoordinatorConfig(data_dir=data_dir, poll_interval=args.poll_interval),
        planner=MockPlanner(),
        node_clients=node_clients,
        node_client_factory=node_client_factory,
    )

    coordinator_config = uvicorn.Config(
        app,
        host="127.0.0.1",
        port=coordinator_port,
        log_level="warning",
        access_log=False,
    )
    coordinator_server = uvicorn.Server(coordinator_config)
    coordinator_server.install_signal_handlers = lambda: None  # type: ignore[method-assign]
    coordinator_thread = threading.Thread(
        target=coordinator_server.run, name="coordinator", daemon=True
    )
    coordinator_thread.start()

    coordinator_url = f"http://127.0.0.1:{coordinator_port}"
    wait_http(f"{coordinator_url}/api/status")

    with httpx.Client(base_url=coordinator_url, timeout=5.0) as client:
        for node_id, base_url in node_urls.items():
            payload = {
                "id": node_id,
                "name": f"Fake {node_id}",
                "kind": "local",
                "api_url": base_url,
                "status": "online",
                "capabilities_json": {
                    "models": ["fake-model"],
                    "tools": ["terminal"],
                    "tags": ["fake"],
                },
                "max_concurrency": 2,
                "credential": tokens[node_id],
            }
            existing = client.get("/api/nodes").json()
            if any(item["id"] == node_id for item in existing):
                response = client.patch(
                    f"/api/nodes/{node_id}",
                    json={
                        "api_url": base_url,
                        "status": "online",
                        "credential": tokens[node_id],
                    },
                )
            else:
                response = client.post("/api/nodes", json=payload)
            if response.status_code not in {200, 201}:
                print(
                    f"E2E_STACK_ERROR=node_register_failed {response.status_code} {response.text}",
                    file=sys.stderr,
                )
                return 1

    meta = {
        "coordinator_url": coordinator_url,
        "data_dir": str(data_dir),
        "nodes": node_urls,
        "node_tokens": tokens,
        "fakes_pid": os_getpid(),
    }
    state_file.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"E2E_STACK_READY={json.dumps(meta, separators=(',', ':'))}", flush=True)
    print(f"COORDINATOR_URL={coordinator_url}", flush=True)
    for node_id, url in node_urls.items():
        print(f"NODE_URL_{node_id.upper().replace('-', '_')}={url}", flush=True)

    stop = threading.Event()

    def _handle_signal(signum: int, _frame: object) -> None:
        print(f"E2E_STACK_SIGNAL={signum}", flush=True)
        stop.set()

    signal.signal(signal.SIGINT, _handle_signal)
    signal.signal(signal.SIGTERM, _handle_signal)

    try:
        while not stop.is_set():
            if not coordinator_thread.is_alive():
                print("E2E_STACK_ERROR=coordinator_exited", file=sys.stderr)
                return 1
            stop.wait(0.2)
    finally:
        coordinator_server.should_exit = True
        for server in node_servers:
            server.should_exit = True
        for fake in fakes:
            fake.close()
        coordinator_thread.join(timeout=3)
        for thread in node_threads:
            thread.join(timeout=3)
        if state_file.exists():
            try:
                state_file.unlink()
            except OSError:
                pass
    return 0


def os_getpid() -> int:
    import os

    return os.getpid()


if __name__ == "__main__":
    raise SystemExit(main())
