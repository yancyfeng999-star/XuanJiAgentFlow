from __future__ import annotations

import httpx
import pytest

from xuanji.domain.enums import NodeKind, NodeStatus, RunStatus, TaskStatus
from xuanji.domain.models import ExecutionPolicy, HermesNode, Task, TaskAttempt, Workflow
from xuanji.nodes import (
    NodeClient,
    NodeConnectionError,
    NodeProtocolError,
    NodeRegistry,
    NodeTimeoutError,
)
from xuanji.scheduler import (
    SchedulerService,
    StateTransitionError,
    ready_tasks,
    score_node,
    transition_task,
)


def make_task(
    task_id: str,
    *,
    dependencies: list[str] | None = None,
    policy: ExecutionPolicy | None = None,
) -> Task:
    return Task(
        id=task_id,
        workflow_id="workflow-1",
        title=task_id,
        dependencies=dependencies or [],
        execution_policy=policy or ExecutionPolicy(),
    )


def make_workflow(*tasks: Task) -> Workflow:
    return Workflow(
        id="workflow-1",
        project_id="project-1",
        version=1,
        goal="test scheduling",
        tasks=list(tasks),
    )


def make_attempt(task_id: str, status: TaskStatus) -> TaskAttempt:
    return TaskAttempt(
        id=f"attempt-{task_id}",
        run_id="run-1",
        task_id=task_id,
        attempt=1,
        status=status,
    )


def make_node(
    node_id: str,
    *,
    kind: NodeKind = NodeKind.REMOTE,
    status: NodeStatus = NodeStatus.ONLINE,
    capabilities: dict | None = None,
    max_concurrency: int = 4,
    running_tasks: int = 0,
    success_rate: float = 1.0,
) -> HermesNode:
    return HermesNode(
        id=node_id,
        name=node_id,
        kind=kind,
        api_url=f"http://{node_id}.test",
        status=status,
        capabilities_json=capabilities
        or {"models": ["m1"], "tools": ["terminal"], "tags": ["research"]},
        max_concurrency=max_concurrency,
        running_tasks=running_tasks,
        success_rate=success_rate,
    )


def test_ready_tasks_require_successful_dependencies_and_inputs() -> None:
    first = make_task("first")
    second = make_task("second", dependencies=["first"])
    workflow = make_workflow(first, second)

    attempts = {
        "first": make_attempt("first", TaskStatus.SUCCESS),
        "second": make_attempt("second", TaskStatus.PENDING),
    }
    assert ready_tasks(workflow, attempts, RunStatus.RUNNING, lambda task: task.id == "second") == [second]
    assert ready_tasks(workflow, attempts, RunStatus.PAUSED, lambda _: True) == []
    assert ready_tasks(workflow, attempts, RunStatus.RUNNING, lambda _: False) == []


def test_failed_dependency_blocks_downstream_and_no_ready_returns_empty() -> None:
    first = make_task("first")
    second = make_task("second", dependencies=["first"])
    workflow = make_workflow(first, second)
    attempts = {
        "first": make_attempt("first", TaskStatus.FAILED),
        "second": make_attempt("second", TaskStatus.PENDING),
    }

    assert ready_tasks(workflow, attempts, RunStatus.RUNNING, lambda _: True) == []


def test_registry_strictly_filters_status_capabilities_and_capacity() -> None:
    task = make_task(
        "task",
        policy=ExecutionPolicy(
            required_models=["m1"],
            required_tools=["terminal"],
            required_tags=["research"],
        ),
    )
    eligible = make_node("eligible")
    offline = make_node("offline", status=NodeStatus.OFFLINE)
    missing_capability = make_node("missing", capabilities={"models": ["m1"], "tools": [], "tags": ["research"]})
    full = make_node("full", max_concurrency=1, running_tasks=1)

    registry = NodeRegistry([offline, missing_capability, full, eligible])
    assert registry.eligible(task) == [eligible]


def test_score_node_uses_normalized_35_25_20_10_10_weights() -> None:
    task = make_task(
        "task",
        policy=ExecutionPolicy(required_models=["m1"], required_tools=["terminal"], required_tags=["research"]),
    )
    node = make_node("node", max_concurrency=4, running_tasks=1, success_rate=0.8)

    # capabilities=1, load=0.75, models=1, latency=max(0, 1-100/1000)=0.9, success=0.8
    assert score_node(task, node, latency_ms=100) == pytest.approx(0.9075)


def test_scheduler_supports_all_placement_modes_and_stable_ties() -> None:
    local_a = make_node("local-a", kind=NodeKind.LOCAL)
    local_b = make_node("local-b", kind=NodeKind.LOCAL)
    remote_a = make_node("remote-a", capabilities={"models": ["m1"], "tools": ["terminal"], "tags": ["research", "gpu"]})
    remote_b = make_node("remote-b", capabilities={"models": ["m1"], "tools": ["terminal"], "tags": ["research", "gpu"]})
    nodes = [remote_b, local_b, remote_a, local_a]
    service = SchedulerService(latency_provider=lambda _: 100)

    fixed = make_task("fixed", policy=ExecutionPolicy(mode="fixed", node_id="remote-b"))
    grouped = make_task("grouped", policy=ExecutionPolicy(mode="node_group", node_group="gpu"))
    local_first = make_task("local", policy=ExecutionPolicy(mode="local_first"))
    remote_first = make_task("remote", policy=ExecutionPolicy(mode="remote_first"))
    automatic = make_task("auto")

    assert service.select_node(fixed, nodes) == remote_b
    assert service.select_node(grouped, nodes) == remote_a
    assert service.select_node(local_first, nodes) == local_a
    assert service.select_node(remote_first, nodes) == remote_a
    assert service.select_node(automatic, [remote_b, remote_a]) == remote_a


def test_scheduler_returns_none_when_no_node_is_eligible() -> None:
    task = make_task("task", policy=ExecutionPolicy(required_models=["missing"]))
    assert SchedulerService().select_node(task, [make_node("node")]) is None


def test_node_group_treats_malformed_external_tags_as_no_match() -> None:
    task = make_task("task", policy=ExecutionPolicy(mode="node_group", node_group="gpu"))
    node = make_node("node", capabilities={"models": [], "tools": [], "tags": None})

    assert SchedulerService().select_node(task, [node]) is None


def test_state_machine_rejects_illegal_transition_with_structured_error() -> None:
    assert transition_task(TaskStatus.PENDING, TaskStatus.READY) is TaskStatus.READY

    with pytest.raises(StateTransitionError) as caught:
        transition_task(TaskStatus.PENDING, TaskStatus.SUCCESS)

    assert caught.value.code == "illegal_task_transition"
    assert caught.value.details == {"current": "pending", "target": "success"}
    assert "pending" in str(caught.value)


@pytest.mark.asyncio
async def test_node_client_uses_bearer_auth_and_validates_protocol() -> None:
    token = "node-secret"

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.headers["Authorization"] == f"Bearer {token}"
        if request.url.path == "/v1/health":
            return httpx.Response(200, json={"status": "ok", "models": ["m1"], "tools": []})
        if request.url.path == "/v1/tasks":
            assert request.method == "POST"
            return httpx.Response(202, json={"id": "task-1", "status": "running"})
        raise AssertionError(request.url.path)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = NodeClient("http://node.test", token, client=transport_client)
        health = await client.health()
        created = await client.create_task("goal", "dispatch-key")

    assert health.status == "ok"
    assert created.id == "task-1"
    assert token not in repr(client)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("exception", "expected_type", "expected_code"),
    [
        (httpx.ReadTimeout("slow"), NodeTimeoutError, "node_timeout"),
        (httpx.ConnectError("offline"), NodeConnectionError, "node_connection_error"),
    ],
)
async def test_node_client_stably_maps_transport_errors(exception, expected_type, expected_code) -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        raise exception

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = NodeClient("http://node.test", "secret-token", client=transport_client)
        with pytest.raises(expected_type) as caught:
            await client.health()

    assert caught.value.code == expected_code
    assert "secret-token" not in str(caught.value)


@pytest.mark.asyncio
async def test_node_client_stably_maps_protocol_errors_without_token_leak() -> None:
    def handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": "secret-token"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as transport_client:
        client = NodeClient("http://node.test", "secret-token", client=transport_client)
        with pytest.raises(NodeProtocolError) as caught:
            await client.health()

    assert caught.value.code == "node_protocol_error"
    assert "secret-token" not in str(caught.value)
