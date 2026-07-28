from __future__ import annotations

import asyncio
import json
import sqlite3
from contextlib import AsyncExitStack
from dataclasses import dataclass
from pathlib import Path

import pytest

from tests.fakes.fake_node import FakeNode, FakeNodeMode
from xuanji.artifacts.manager import ArtifactManager
from xuanji.domain.enums import NodeKind, NodeStatus, RunStatus, TaskStatus, WorkflowStatus
from xuanji.domain.models import Artifact, HermesNode, Project, Run, Task, TaskAttempt, Workflow
from xuanji.execution.manager import ExecutionManager
from xuanji.execution.recovery import RecoveryService
from xuanji.nodes import NodeClient
from xuanji.storage.database import Database
from xuanji.storage.migrations import migrate
from xuanji.storage.repositories import (
    ArtifactRepository,
    EventRepository,
    NodeRepository,
    ProjectRepository,
    RunRepository,
    WorkflowRepository,
)


@dataclass
class Harness:
    database: Database
    artifacts: ArtifactManager
    manager: ExecutionManager
    runs: RunRepository
    events: EventRepository
    artifact_repository: ArtifactRepository
    project_root: Path
    fakes: dict[str, FakeNode]


async def make_harness(
    tmp_path: Path,
    stack: AsyncExitStack,
    modes: list[FakeNodeMode],
    tasks: list[Task],
    *,
    delay_polls: int = 2,
    poll_interval: float = 60.0,
) -> Harness:
    database = Database(tmp_path / "xuanji.db")
    migrate(database)
    artifacts = ArtifactManager(tmp_path / "projects")
    project = Project(id="project-1", name="Project", root_path=str(tmp_path / "projects" / "project-1"))
    ProjectRepository(database).create(project)
    project_root = artifacts.create_project(project)
    workflow = Workflow(
        id="workflow-1",
        project_id=project.id,
        version=1,
        goal="Execute integration workflow",
        status=WorkflowStatus.REVIEWED,
        tasks=tasks,
    )
    WorkflowRepository(database).save(workflow)
    run = Run(id="run-1", workflow_id=workflow.id)
    runs = RunRepository(database)
    runs.create(run)
    artifacts.create_run(project.id, run.id, workflow.id)

    clients: dict[str, NodeClient] = {}
    fakes: dict[str, FakeNode] = {}
    nodes = NodeRepository(database)
    for index, mode in enumerate(modes, start=1):
        node_id = f"node-{index}"
        fake = FakeNode(mode, delay_polls=delay_polls)
        fakes[node_id] = fake
        stack.callback(fake.close)
        transport_client = await stack.enter_async_context(fake.client(f"http://{node_id}.test"))
        clients[node_id] = NodeClient(f"http://{node_id}.test", fake.token, client=transport_client)
        nodes.upsert(
            HermesNode(
                id=node_id,
                name=node_id,
                kind=NodeKind.REMOTE,
                api_url=f"http://{node_id}.test",
                status=NodeStatus.ONLINE,
                capabilities_json={"models": ["fake-model"], "tools": ["terminal"], "tags": ["fake"]},
                max_concurrency=1,
            )
        )

    manager = ExecutionManager(database, artifacts, clients, poll_interval=poll_interval)
    stack.push_async_callback(manager.close)
    return Harness(
        database=database,
        artifacts=artifacts,
        manager=manager,
        runs=runs,
        events=EventRepository(database),
        artifact_repository=ArtifactRepository(database),
        project_root=project_root,
        fakes=fakes,
    )


def task(task_id: str, *, dependencies: list[str] | None = None) -> Task:
    return Task(
        id=task_id,
        workflow_id="workflow-1",
        title=task_id,
        prompt=f"Complete {task_id}",
        dependencies=dependencies or [],
    )


async def wait_until(predicate, *, timeout: float = 1.0) -> None:
    async with asyncio.timeout(timeout):
        while not predicate():
            await asyncio.sleep(0)


@pytest.mark.asyncio
async def test_parallel_nodes_persist_attempts_events_artifacts_and_delivery_manifest(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS, FakeNodeMode.SUCCESS], [task("one"), task("two")])

        await harness.manager.start("run-1")
        attempts = harness.runs.latest_attempts("run-1")
        assert {attempt.node_id for attempt in attempts.values()} == {"node-1", "node-2"}
        assert {attempt.id for attempt in attempts.values()} == {"run-1:one:1", "run-1:two:1"}
        assert all(attempt.status is TaskStatus.RUNNING for attempt in attempts.values())

        await harness.manager.reconcile("run-1")

        assert harness.runs.get("run-1").status is RunStatus.SUCCESS
        assert all(attempt.status is TaskStatus.SUCCESS for attempt in harness.runs.latest_attempts("run-1").values())
        assert len(harness.artifact_repository.list_for_run("run-1")) == 2
        delivery = json.loads((harness.project_root / "deliverables" / "manifest.json").read_text())
        assert delivery["run_id"] == "run-1"
        assert {entry["task_id"] for entry in delivery["artifacts"]} == {"one", "two"}
        event_types = [event.event_type for event in harness.events.list_for_run("run-1")]
        assert "run.status_changed" in event_types
        assert event_types.count("task.status_changed") >= 8


@pytest.mark.asyncio
async def test_capacity_waits_without_blocking_and_dispatches_on_next_step(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one"), task("two")])

        await harness.manager.start("run-1")
        attempts = harness.runs.latest_attempts("run-1")
        assert attempts["one"].status is TaskStatus.RUNNING
        assert attempts["two"].status is TaskStatus.READY

        await harness.manager.reconcile("run-1")
        assert harness.runs.latest_attempts("run-1")["two"].status is TaskStatus.RUNNING
        await harness.manager.reconcile("run-1")
        assert harness.runs.get("run-1").status is RunStatus.SUCCESS


@pytest.mark.asyncio
async def test_failed_task_can_retry_with_incremented_dispatch_key(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.FAILURE], [task("one")])
        fake = harness.fakes["node-1"]

        await harness.manager.start("run-1")
        await harness.manager.reconcile("run-1")
        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.FAILED
        assert harness.runs.get("run-1").status is RunStatus.BLOCKED

        fake.mode = FakeNodeMode.SUCCESS
        retried = await harness.manager.retry_task("run-1", "one")
        assert retried.attempt == 2
        assert retried.id == "run-1:one:2"
        assert "run-1:one:2" in fake.tasks

        await harness.manager.reconcile("run-1")
        assert harness.runs.get("run-1").status is RunStatus.SUCCESS


@pytest.mark.asyncio
async def test_pause_stops_progress_until_resume(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")], delay_polls=1)
        fake = harness.fakes["node-1"]

        await harness.manager.start("run-1")
        await harness.manager.pause("run-1")
        await harness.manager.step("run-1")
        assert next(iter(fake.tasks.values())).polls == 0
        assert harness.runs.get("run-1").status is RunStatus.PAUSED

        await harness.manager.resume("run-1")
        await harness.manager.reconcile("run-1")
        assert next(iter(fake.tasks.values())).polls == 1
        await harness.manager.reconcile("run-1")
        assert harness.runs.get("run-1").status is RunStatus.SUCCESS


@pytest.mark.asyncio
async def test_cancel_waits_for_real_remote_confirmation(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")])
        fake = harness.fakes["node-1"]

        await harness.manager.start("run-1")
        await harness.manager.cancel("run-1")

        assert fake.cancel_calls == 1
        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.CANCELLED
        assert harness.runs.get("run-1").status is RunStatus.CANCELLED


@pytest.mark.asyncio
async def test_offline_dispatch_is_persisted_as_blocked(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.OFFLINE], [task("one")])

        await harness.manager.start("run-1")

        attempt = harness.runs.latest_attempts("run-1")["one"]
        assert attempt.status is TaskStatus.BLOCKED
        assert attempt.error == {"code": "node_connection_error", "message": "node connection failed"}
        assert harness.runs.get("run-1").status is RunStatus.BLOCKED


@pytest.mark.asyncio
@pytest.mark.parametrize("mode", [FakeNodeMode.BAD_HASH, FakeNodeMode.BAD_DOWNLOAD_HEADERS])
async def test_artifacts_require_matching_manifest_headers_and_body_hash(tmp_path: Path, mode: FakeNodeMode) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [mode], [task("one")])

        await harness.manager.start("run-1")
        await harness.manager.reconcile("run-1")

        attempt = harness.runs.latest_attempts("run-1")["one"]
        assert attempt.status is TaskStatus.ARTIFACT_FAILED
        assert attempt.error["code"] == "artifact_verification_failed"
        assert harness.artifact_repository.list_for_run("run-1") == []
        assert harness.runs.get("run-1").status is RunStatus.BLOCKED


@pytest.mark.asyncio
async def test_recovery_reconciles_non_terminal_remote_attempt_after_restart(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one")])
        await harness.manager.start("run-1")

        restarted = ExecutionManager(harness.database, harness.artifacts, harness.manager.node_clients)
        await RecoveryService(restarted).recover_all()

        assert harness.runs.get("run-1").status is RunStatus.SUCCESS
        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.SUCCESS


@pytest.mark.asyncio
async def test_recovery_reconciles_paused_run_without_dispatching_new_work(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one"), task("two")])
        await harness.manager.start("run-1")
        await harness.manager.pause("run-1")

        restarted = ExecutionManager(harness.database, harness.artifacts, harness.manager.node_clients)
        await RecoveryService(restarted).recover_all()

        attempts = harness.runs.latest_attempts("run-1")
        assert attempts["one"].status is TaskStatus.SUCCESS
        assert attempts["two"].status is TaskStatus.READY
        assert harness.runs.get("run-1").status is RunStatus.PAUSED
        assert sum(fake.create_calls for fake in harness.fakes.values()) == 1


@pytest.mark.asyncio
async def test_cancel_pending_run_finishes_without_illegal_transition(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one")])

        await harness.manager.cancel("run-1")

        assert harness.runs.get("run-1").status is RunStatus.CANCELLED
        await harness.manager.close()


@pytest.mark.asyncio
async def test_cancel_run_with_pending_and_failed_attempts_finishes(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one"), task("two")])
        run = harness.runs.get("run-1")
        run.status = RunStatus.BLOCKED
        harness.runs.update(run)
        pending = TaskAttempt(id="run-1:one:1", run_id="run-1", task_id="one", attempt=1)
        failed = TaskAttempt(
            id="run-1:two:1",
            run_id="run-1",
            task_id="two",
            attempt=1,
            status=TaskStatus.FAILED,
        )
        harness.runs.save_attempt(pending)
        harness.runs.save_attempt(failed)

        await harness.manager.cancel("run-1")

        attempts = harness.runs.latest_attempts("run-1")
        assert attempts["one"].status is TaskStatus.CANCELLED
        assert attempts["two"].status is TaskStatus.FAILED
        assert harness.runs.get("run-1").status is RunStatus.CANCELLED
        await harness.manager.close()


@pytest.mark.asyncio
async def test_recovery_finishes_cancelling_run_from_remote_confirmation(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")])
        await harness.manager.start("run-1")
        attempt = harness.runs.latest_attempts("run-1")["one"]
        attempt.status = TaskStatus.CANCELLING
        harness.runs.update_attempt(attempt)
        run = harness.runs.get("run-1")
        run.status = RunStatus.CANCELLING
        harness.runs.update(run)
        harness.fakes["node-1"].tasks[attempt.id].status = "cancelled"

        restarted = ExecutionManager(harness.database, harness.artifacts, harness.manager.node_clients)
        await RecoveryService(restarted).recover_all()

        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.CANCELLED
        assert harness.runs.get("run-1").status is RunStatus.CANCELLED


@pytest.mark.asyncio
async def test_start_is_idempotent_and_does_not_redispatch(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")])
        fake = harness.fakes["node-1"]

        await harness.manager.start("run-1")
        await harness.manager.start("run-1")

        assert fake.create_calls == 1
        assert len(harness.runs.list_attempts("run-1", "one")) == 1


@pytest.mark.asyncio
async def test_background_loop_completes_run_and_close_cleans_up_once(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(
            tmp_path,
            stack,
            [FakeNodeMode.SUCCESS],
            [task("one")],
            poll_interval=0.001,
        )

        await harness.manager.start("run-1")
        first_loop = harness.manager._loops["run-1"]
        await harness.manager.start("run-1")

        assert harness.manager._loops["run-1"] is first_loop
        await wait_until(lambda: harness.runs.get("run-1").status is RunStatus.SUCCESS)
        await wait_until(lambda: "run-1" not in harness.manager._loops)
        await harness.manager.close()
        assert not harness.manager._loops


@pytest.mark.asyncio
async def test_resume_reuses_connection_blocked_attempt_without_manual_retry(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.OFFLINE], [task("one")])
        fake = harness.fakes["node-1"]

        await harness.manager.start("run-1")
        attempt = harness.runs.latest_attempts("run-1")["one"]
        assert attempt.status is TaskStatus.BLOCKED

        fake.mode = FakeNodeMode.SUCCESS
        replacement = await stack.enter_async_context(fake.client("http://node-1.test"))
        harness.manager.node_clients["node-1"] = NodeClient("http://node-1.test", fake.token, client=replacement)
        await harness.manager.resume("run-1")
        await harness.manager.reconcile("run-1")

        recovered = harness.runs.latest_attempts("run-1")["one"]
        assert recovered.id == attempt.id
        assert len(harness.runs.list_attempts("run-1", "one")) == 1
        assert harness.runs.get("run-1").status is RunStatus.SUCCESS


@pytest.mark.asyncio
async def test_recovery_reuses_connection_blocked_attempt_without_manual_retry(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.OFFLINE], [task("one")])
        await harness.manager.start("run-1")
        attempt = harness.runs.latest_attempts("run-1")["one"]
        fake = harness.fakes["node-1"]
        fake.mode = FakeNodeMode.SUCCESS
        replacement = await stack.enter_async_context(fake.client("http://node-1.test"))
        clients = {"node-1": NodeClient("http://node-1.test", fake.token, client=replacement)}
        restarted = ExecutionManager(harness.database, harness.artifacts, clients, poll_interval=60.0)

        await RecoveryService(restarted).recover_all()

        recovered = harness.runs.latest_attempts("run-1")["one"]
        assert recovered.id == attempt.id
        assert recovered.status is TaskStatus.SUCCESS
        assert len(harness.runs.list_attempts("run-1", "one")) == 1
        await restarted.close()


@pytest.mark.asyncio
async def test_protocol_blocked_attempt_still_requires_manual_retry(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.SUCCESS], [task("one")])
        await harness.manager.start("run-1")
        attempt = harness.runs.latest_attempts("run-1")["one"]
        attempt.status = TaskStatus.BLOCKED
        attempt.error = {"code": "node_protocol_error", "message": "bad protocol"}
        harness.runs.update_attempt(attempt)
        run = harness.runs.get("run-1")
        run.status = RunStatus.BLOCKED
        harness.runs.update(run)

        await harness.manager.resume("run-1")
        await harness.manager.reconcile("run-1")

        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.BLOCKED
        assert harness.fakes["node-1"].create_calls == 1


@pytest.mark.asyncio
async def test_dispatch_and_reconcile_independent_attempts_concurrently(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(
            tmp_path,
            stack,
            [FakeNodeMode.DELAY, FakeNodeMode.DELAY],
            [task("one"), task("two")],
            delay_polls=100,
        )
        entered = 0
        both_entered = asyncio.Event()
        release = asyncio.Event()

        async def concurrent_create(goal: str, idempotency_key: str):
            nonlocal entered
            entered += 1
            if entered == 2:
                both_entered.set()
            await release.wait()
            return await original_creates[idempotency_key.split(":")[1]](goal, idempotency_key)

        original_creates = {
            "one": harness.manager.node_clients["node-1"].create_task,
            "two": harness.manager.node_clients["node-2"].create_task,
        }
        harness.manager.node_clients["node-1"].create_task = concurrent_create
        harness.manager.node_clients["node-2"].create_task = concurrent_create
        start = asyncio.create_task(harness.manager.start("run-1"))
        await asyncio.wait_for(both_entered.wait(), timeout=1)
        release.set()
        await start

        entered = 0
        both_entered.clear()
        release.clear()
        original_gets = {
            "one": harness.manager.node_clients["node-1"].get_task,
            "two": harness.manager.node_clients["node-2"].get_task,
        }

        async def concurrent_get(attempt_id: str):
            nonlocal entered
            entered += 1
            if entered == 2:
                both_entered.set()
            await release.wait()
            return await original_gets[attempt_id.split(":")[1]](attempt_id)

        harness.manager.node_clients["node-1"].get_task = concurrent_get
        harness.manager.node_clients["node-2"].get_task = concurrent_get
        reconcile = asyncio.create_task(harness.manager.reconcile("run-1"))
        await asyncio.wait_for(both_entered.wait(), timeout=1)
        release.set()
        await reconcile
        await harness.manager.close()


@pytest.mark.asyncio
async def test_step_calls_for_same_run_are_serialized(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")], delay_polls=100)
        await harness.manager.start("run-1")
        client = harness.manager.node_clients["node-1"]
        original_get = client.get_task
        entered = 0
        maximum = 0
        release = asyncio.Event()

        async def guarded_get(attempt_id: str):
            nonlocal entered, maximum
            entered += 1
            maximum = max(maximum, entered)
            await release.wait()
            try:
                return await original_get(attempt_id)
            finally:
                entered -= 1

        client.get_task = guarded_get
        first = asyncio.create_task(harness.manager.reconcile("run-1"))
        await wait_until(lambda: entered == 1)
        second = asyncio.create_task(harness.manager.reconcile("run-1"))
        await asyncio.sleep(0)
        assert maximum == 1
        release.set()
        await asyncio.gather(first, second)
        assert maximum == 1
        await harness.manager.close()


@pytest.mark.asyncio
async def test_node_capacity_counts_active_attempts_from_other_runs(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")], delay_polls=100)
        harness.runs.create(Run(id="run-2", workflow_id="workflow-1"))
        harness.artifacts.create_run("project-1", "run-2", "workflow-1")

        await harness.manager.start("run-1")
        await harness.manager.start("run-2")

        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.RUNNING
        assert harness.runs.latest_attempts("run-2")["one"].status is TaskStatus.READY
        assert harness.fakes["node-1"].create_calls == 1
        await harness.manager.close()


@pytest.mark.asyncio
async def test_failed_attempt_does_not_block_run_while_independent_work_can_progress(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(
            tmp_path,
            stack,
            [FakeNodeMode.FAILURE, FakeNodeMode.DELAY],
            [task("one"), task("two")],
            delay_polls=100,
        )
        await harness.manager.start("run-1")
        await harness.manager.reconcile("run-1")

        attempts = harness.runs.latest_attempts("run-1")
        assert attempts["one"].status is TaskStatus.FAILED
        assert attempts["two"].status is TaskStatus.RUNNING
        assert harness.runs.get("run-1").status is RunStatus.RUNNING
        await harness.manager.close()


@pytest.mark.asyncio
async def test_cancelling_recovery_reissues_cancel_when_remote_still_running(tmp_path: Path) -> None:
    async with AsyncExitStack() as stack:
        harness = await make_harness(tmp_path, stack, [FakeNodeMode.DELAY], [task("one")], delay_polls=100)
        await harness.manager.start("run-1")
        attempt = harness.runs.latest_attempts("run-1")["one"]
        attempt.status = TaskStatus.CANCELLING
        harness.runs.update_attempt(attempt)
        run = harness.runs.get("run-1")
        run.status = RunStatus.CANCELLING
        harness.runs.update(run)
        fake = harness.fakes["node-1"]

        restarted = ExecutionManager(harness.database, harness.artifacts, harness.manager.node_clients, poll_interval=60.0)
        await RecoveryService(restarted).recover_all()

        assert fake.cancel_calls == 1
        assert harness.runs.latest_attempts("run-1")["one"].status is TaskStatus.CANCELLED
        assert harness.runs.get("run-1").status is RunStatus.CANCELLED
        await restarted.close()


def test_attempt_success_artifacts_and_event_commit_atomically(tmp_path: Path) -> None:
    database = Database(tmp_path / "atomic.db")
    migrate(database)
    project = Project(id="project-1", name="Project", root_path=str(tmp_path / "project"))
    ProjectRepository(database).create(project)
    workflow = Workflow(
        id="workflow-1",
        project_id=project.id,
        version=1,
        goal="Atomic persistence",
        status=WorkflowStatus.REVIEWED,
        tasks=[task("one")],
    )
    WorkflowRepository(database).save(workflow)
    runs = RunRepository(database)
    runs.create(Run(id="run-1", workflow_id=workflow.id))
    attempt = TaskAttempt(id="run-1:one:1", run_id="run-1", task_id="one", attempt=1, status=TaskStatus.COLLECTING)
    runs.save_attempt(attempt)
    artifact = Artifact(
        id="artifact-1",
        run_id="run-1",
        task_id="one",
        attempt_id=attempt.id,
        relative_path="runs/run-1/tasks/one/artifacts/result.txt",
        media_type="text/plain",
        size=1,
        sha256="0" * 64,
    )
    database.connection.execute(
        """CREATE TRIGGER fail_success_event BEFORE INSERT ON events
        WHEN NEW.event_type='task.status_changed' BEGIN SELECT RAISE(ABORT, 'forced'); END"""
    )

    attempt.status = TaskStatus.SUCCESS
    with pytest.raises(sqlite3.IntegrityError, match="forced"):
        runs.commit_attempt_success(
            attempt,
            [artifact],
            {"task_id": "one", "attempt_id": attempt.id, "status": "success"},
        )

    assert runs.latest_attempts("run-1")["one"].status is TaskStatus.COLLECTING
    assert ArtifactRepository(database).list_for_run("run-1") == []
    assert EventRepository(database).list_for_run("run-1") == []
