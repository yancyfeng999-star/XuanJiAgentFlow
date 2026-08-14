from __future__ import annotations

import asyncio
import hashlib
import json
from datetime import datetime, timedelta, timezone
from pathlib import PurePosixPath
from typing import Mapping

from xuanji.artifacts.manager import ArtifactManager, ArtifactVerificationError, UnsafePathError
from xuanji.artifacts.manifest import ArtifactEntry, ArtifactManifest
from xuanji.domain.enums import RunStatus, TaskStatus
from xuanji.domain.models import Artifact, HermesNode, Run, Task, TaskAttempt, Workflow
from xuanji.nodes import (
    NodeClient,
    NodeClientError,
    NodeConnectionError,
    NodeProtocolError,
    NodeTimeoutError,
    NoopTunnelProvider,
    TunnelError,
    TunnelProvider,
    TaskDispatch,
    TaskInput,
    TaskOutputPolicy,
    VerifyStep,
)
from xuanji.scheduler import SchedulerService, ready_tasks, transition_run, transition_task
from xuanji.storage.database import Database
from xuanji.storage.repositories import (
    ArtifactRepository,
    EventRepository,
    NodeRepository,
    ProjectRepository,
    RunRepository,
    WorkflowRepository,
)

_TERMINAL_RUNS = {RunStatus.CANCELLED, RunStatus.SUCCESS, RunStatus.FAILED}
_TERMINAL_TASKS = {TaskStatus.SUCCESS, TaskStatus.CANCELLED, TaskStatus.SKIPPED, TaskStatus.NEEDS_REVIEW}
_ACTIVE_TASKS = {TaskStatus.RUNNING, TaskStatus.DISPATCHING, TaskStatus.COLLECTING, TaskStatus.CANCELLING}
_FAILURE_TASKS = {TaskStatus.FAILED, TaskStatus.ARTIFACT_FAILED, TaskStatus.DISPATCH_FAILED, TaskStatus.BLOCKED}
_TRANSIENT_ERROR_CODES = {"node_connection_error", "node_timeout"}
# Keep tunnel open while attempt may still talk to the remote node.
_TUNNEL_OWNER_STATUSES = _ACTIVE_TASKS


class ExecutionManager:
    def __init__(
        self,
        database: Database,
        artifacts: ArtifactManager,
        node_clients: Mapping[str, NodeClient],
        scheduler: SchedulerService | None = None,
        *,
        poll_interval: float = 1.0,
        tunnels: TunnelProvider | None = None,
    ) -> None:
        if poll_interval <= 0:
            raise ValueError("轮询间隔必须大于零")
        self.database = database
        self.artifacts = artifacts
        self.node_clients = dict(node_clients)
        self.scheduler = scheduler or SchedulerService()
        self.poll_interval = poll_interval
        self.tunnels: TunnelProvider = tunnels or NoopTunnelProvider()
        self.runs = RunRepository(database)
        self.workflows = WorkflowRepository(database)
        self.projects = ProjectRepository(database)
        self.nodes = NodeRepository(database)
        self.artifact_repository = ArtifactRepository(database)
        self.events = EventRepository(database)
        self._loops: dict[str, asyncio.Task[None]] = {}
        self._step_locks: dict[str, asyncio.Lock] = {}
        self._dispatch_lock = asyncio.Lock()
        self._attempt_clients: dict[str, NodeClient] = {}

    async def start(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            if run.status is RunStatus.PENDING:
                run.started_at = datetime.now(timezone.utc)
                self._set_run_status(run, RunStatus.RUNNING)
            elif run.status is not RunStatus.RUNNING:
                return
            await self._step(run_id)
        self._ensure_loop(run_id)

    async def pause(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            if run.status is RunStatus.RUNNING:
                self._set_run_status(run, RunStatus.PAUSED)

    async def resume(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            was_blocked = run.status is RunStatus.BLOCKED
            if run.status in {RunStatus.PAUSED, RunStatus.BLOCKED}:
                self._set_run_status(run, RunStatus.RUNNING)
                self._restore_transient_attempts(run_id)
                if was_blocked:
                    await self._step(run_id)
        self._ensure_loop(run_id)

    async def recover(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            restored = run.status is RunStatus.BLOCKED and self._has_transient_blocked_attempt(run_id)
            if restored:
                self._set_run_status(run, RunStatus.RUNNING)
                self._restore_transient_attempts(run_id)
            await self._reconcile(run_id)
            if restored:
                await self._reconcile(run_id)
        self._ensure_loop(run_id)

    async def close(self) -> None:
        loops = list(self._loops.values())
        for loop in loops:
            loop.cancel()
        if loops:
            await asyncio.gather(*loops, return_exceptions=True)
        self._loops.clear()
        self._attempt_clients.clear()
        await self.tunnels.close_all()

    async def cancel(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            if run.status in _TERMINAL_RUNS:
                return
            self._set_run_status(run, RunStatus.CANCELLING)
            remote_cancellations = []
            for attempt in self.runs.latest_attempts(run_id).values():
                if attempt.status not in _ACTIVE_TASKS:
                    if attempt.status in {TaskStatus.PENDING, TaskStatus.READY, TaskStatus.BLOCKED}:
                        self._set_attempt_status(attempt, TaskStatus.CANCELLED)
                    continue
                if attempt.status is not TaskStatus.CANCELLING:
                    self._set_attempt_status(attempt, TaskStatus.CANCELLING)
                remote_cancellations.append(self._cancel_remote(attempt))
            if remote_cancellations:
                await asyncio.gather(*remote_cancellations)
            self._settle_cancellation(run)
        self._ensure_loop(run_id)

    async def retry_task(self, run_id: str, task_id: str) -> TaskAttempt:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            workflow = self._workflow(run.workflow_id)
            task = self._task(workflow, task_id)
            previous = self.runs.latest_attempts(run_id).get(task_id)
            if previous is None or previous.status not in _FAILURE_TASKS | {TaskStatus.NEEDS_REVIEW}:
                raise ValueError(f"任务 {task_id} 当前不可重试")
            if previous.attempt >= task.retry_policy.max_attempts:
                raise ValueError(f"任务 {task_id} 已用完重试次数")
            attempt = self._new_attempt(run_id, task, previous.attempt + 1)
            self.runs.save_attempt(attempt)
            self._event(run_id, "task.attempt_created", attempt)
            if run.status is RunStatus.BLOCKED:
                self._set_run_status(run, RunStatus.RUNNING)
            await self._dispatch(run, workflow, task, attempt)
            result = self.runs.latest_attempts(run_id)[task_id]
        self._ensure_loop(run_id)
        return result

    async def skip_task(self, run_id: str, task_id: str) -> None:
        async with self._step_lock(run_id):
            run = self._run(run_id)
            workflow = self._workflow(run.workflow_id)
            task = self._task(workflow, task_id)
            attempt = self.runs.latest_attempts(run_id).get(task_id)
            if attempt is None:
                attempt = self._new_attempt(run_id, task, 1)
                self.runs.save_attempt(attempt)
                self._event(run_id, "task.attempt_created", attempt)
            self._set_attempt_status(attempt, TaskStatus.SKIPPED)
            if run.status is RunStatus.BLOCKED:
                self._set_run_status(run, RunStatus.RUNNING)
            await self._step(run_id)
        self._ensure_loop(run_id)

    async def step(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            await self._step(run_id)

    async def reconcile(self, run_id: str) -> None:
        async with self._step_lock(run_id):
            await self._reconcile(run_id)

    async def _step(self, run_id: str) -> None:
        run = self._run(run_id)
        if run.status is not RunStatus.RUNNING:
            return
        workflow = self._workflow(run.workflow_id)
        await self._reconcile_active(run, workflow)
        run = self._run(run_id)
        if run.status is RunStatus.RUNNING:
            await self._dispatch_ready(run, workflow)
        elif run.status is RunStatus.CANCELLING:
            self._settle_cancellation(run)

    async def _reconcile(self, run_id: str) -> None:
        run = self._run(run_id)
        if run.status in _TERMINAL_RUNS:
            return
        workflow = self._workflow(run.workflow_id)
        await self._reconcile_active(run, workflow)
        run = self._run(run_id)
        if run.status is RunStatus.RUNNING:
            await self._dispatch_due_retries(run, workflow)
            await self._dispatch_ready(run, workflow)
        elif run.status is RunStatus.CANCELLING:
            self._settle_cancellation(run)

    async def _dispatch_ready(self, run: Run, workflow: Workflow) -> None:
        attempts = self.runs.latest_attempts(run.id)
        dispatches = []
        for task in ready_tasks(workflow, attempts, run.status, lambda _: True):
            attempt = attempts.get(task.id)
            if attempt is None:
                attempt = self._new_attempt(run.id, task, 1)
                self.runs.save_attempt(attempt)
                self._event(run.id, "task.attempt_created", attempt)
                attempts[task.id] = attempt
            dispatches.append(self._dispatch(run, workflow, task, attempt))
        if dispatches:
            await asyncio.gather(*dispatches)
        self._settle_run(run, workflow)

    async def _reconcile_active(self, run: Run, workflow: Workflow) -> None:
        reconciliations = [
            self._reconcile_attempt(run, workflow, attempt)
            for attempt in self.runs.latest_attempts(run.id).values()
            if attempt.status in _ACTIVE_TASKS
        ]
        if reconciliations:
            await asyncio.gather(*reconciliations)

    async def _reconcile_attempt(self, run: Run, workflow: Workflow, attempt: TaskAttempt) -> None:
        task = self._task(workflow, attempt.task_id)
        if (
            attempt.status is TaskStatus.RUNNING
            and attempt.started_at is not None
            and datetime.now(timezone.utc) - attempt.started_at
            >= timedelta(seconds=task.execution_policy.timeout_seconds)
        ):
            try:
                client = await self._client_for_attempt(attempt)
                await client.cancel_task(attempt.id)
            except (NodeClientError, TunnelError):
                pass
            attempt.error = {
                "code": "task_timeout",
                "message": f"任务执行超过 {task.execution_policy.timeout_seconds} 秒",
            }
            self._set_attempt_status(attempt, TaskStatus.FAILED)
            return
        try:
            client = await self._client_for_attempt(attempt)
            remote = await client.get_task(attempt.id)
        except (NodeClientError, TunnelError) as error:
            if attempt.status is TaskStatus.CANCELLING:
                self._record_cancel_error(attempt, error)
            else:
                self._block_attempt(attempt, error)
            return
        await self._sync_logs(workflow, run, attempt, client)
        if remote.status in {"running", "pending", "queued"}:
            if attempt.status is TaskStatus.CANCELLING:
                await self._cancel_remote(attempt)
            elif attempt.status is not TaskStatus.RUNNING:
                self._set_attempt_status(attempt, TaskStatus.RUNNING)
            return
        if remote.status in {"cancelled", "stopped"}:
            self._set_attempt_status(attempt, TaskStatus.CANCELLED)
            return
        if attempt.status is TaskStatus.CANCELLING:
            await self._cancel_remote(attempt)
            return
        if remote.status == "failed":
            attempt.error = {"code": "remote_task_failed", "message": remote.error or "远程任务执行失败"}
            self._set_attempt_status(attempt, TaskStatus.FAILED)
            return
        if remote.status == "success":
            self._set_attempt_status(attempt, TaskStatus.COLLECTING)
            await self._collect(run, workflow, task, attempt)
            return
        if remote.status == "needs_review":
            self._set_attempt_status(attempt, TaskStatus.COLLECTING)
            await self._collect(run, workflow, task, attempt, needs_review=True)
            return
        attempt.error = {"code": "node_protocol_error", "message": f"节点返回未知状态：{remote.status}"}
        self._set_attempt_status(attempt, TaskStatus.BLOCKED)

    async def _sync_logs(
        self,
        workflow: Workflow,
        run: Run,
        attempt: TaskAttempt,
        client: NodeClient,
    ) -> None:
        path = self.artifacts.resolve_project_path(
            workflow.project_id,
            f"runs/{run.id}/tasks/{attempt.task_id}/logs.jsonl",
        )
        offset = 0
        if path.is_file():
            with path.open(encoding="utf-8") as stream:
                offset = sum(1 for _ in stream)
        try:
            page = await client.logs(attempt.id, offset)
        except NodeClientError:
            return
        if not page.events:
            return
        with path.open("a", encoding="utf-8") as stream:
            for event in page.events:
                stream.write(json.dumps(event, ensure_ascii=False) + "\n")
        self.events.append(
            run.id,
            "task.logs_appended",
            {"run_id": run.id, "task_id": attempt.task_id, "count": len(page.events)},
        )

    async def _dispatch_due_retries(self, run: Run, workflow: Workflow) -> None:
        now = datetime.now(timezone.utc)
        for task in workflow.tasks:
            previous = self.runs.latest_attempts(run.id).get(task.id)
            if (
                previous is None
                or previous.status not in {TaskStatus.FAILED, TaskStatus.ARTIFACT_FAILED, TaskStatus.DISPATCH_FAILED}
                or previous.attempt >= task.retry_policy.max_attempts
                or previous.completed_at is None
                or now < previous.completed_at + timedelta(seconds=task.retry_policy.delay_seconds)
            ):
                continue
            attempt = self._new_attempt(run.id, task, previous.attempt + 1)
            self.runs.save_attempt(attempt)
            self._event(run.id, "task.attempt_created", attempt, automatic=True)
            await self._dispatch(run, workflow, task, attempt)

    async def _dispatch(self, run: Run, workflow: Workflow, task: Task, attempt: TaskAttempt) -> None:
        if attempt.status is TaskStatus.BLOCKED:
            self._set_attempt_status(attempt, TaskStatus.READY)
        elif attempt.status in {TaskStatus.PENDING, TaskStatus.RETRY_WAIT}:
            self._set_attempt_status(attempt, TaskStatus.READY)
        async with self._dispatch_lock:
            configured_nodes = self.nodes.list()
            active_counts = self.runs.count_active_attempts_by_node()
            available_nodes = [
                node.model_copy(update={"running_tasks": max(node.running_tasks, active_counts.get(node.id, 0))})
                for node in configured_nodes
            ]
            node = None
            if attempt.node_id is not None:
                node = next(
                    (
                        candidate
                        for candidate in available_nodes
                        if candidate.id == attempt.node_id
                        and candidate.running_tasks < candidate.max_concurrency
                    ),
                    None,
                )
            node = node or self.scheduler.select_node(task, available_nodes)
            if node is None:
                if self.scheduler.select_node(task, configured_nodes) is not None:
                    return
                attempt.error = {"code": "no_eligible_node", "message": "没有符合调度条件的可用节点"}
                self._set_attempt_status(attempt, TaskStatus.BLOCKED)
                return
            attempt.node_id = node.id
            self._set_attempt_status(attempt, TaskStatus.DISPATCHING)
        self.artifacts.create_task(workflow.project_id, run.id, task.id, task.prompt or task.description or task.title)
        try:
            client = await self._client_for_attempt(attempt, node=node)
            staged_inputs: list[tuple[TaskInput, bytes]] = []
            for artifact in self.artifact_repository.list_for_run(run.id):
                if artifact.task_id not in task.dependencies:
                    continue
                marker = "/artifacts/"
                output_path = (
                    artifact.relative_path.split(marker, 1)[1]
                    if marker in artifact.relative_path
                    else PurePosixPath(artifact.relative_path).name
                )
                input_path = f"{artifact.task_id}/{output_path}"
                local_path = self.artifacts.resolve_project_path(workflow.project_id, artifact.relative_path)
                body = local_path.read_bytes()
                if len(body) != artifact.size:
                    raise ArtifactVerificationError(f"输入产物大小不匹配：{artifact.relative_path}")
                if hashlib.sha256(body).hexdigest() != artifact.sha256:
                    raise ArtifactVerificationError(f"输入产物哈希不匹配：{artifact.relative_path}")
                staged_inputs.append(
                    (
                        TaskInput(
                            source_task_id=artifact.task_id,
                            path=input_path,
                            size=artifact.size,
                            sha256=artifact.sha256,
                        ),
                        body,
                    )
                )
            dispatch = TaskDispatch(
                idempotency_key=attempt.id,
                instruction=task.prompt or task.description or task.title,
                project_id=workflow.project_id,
                run_id=run.id,
                task_id=task.id,
                inputs=[item for item, _ in staged_inputs],
                output_policy=TaskOutputPolicy(
                    mode="strict" if task.expected_outputs else "discover",
                    expected=[output.path for output in task.expected_outputs],
                ),
                writes=list(task.writes),
                done_definition=list(task.done_definition),
                verify=[VerifyStep.model_validate(step.model_dump()) for step in task.verify],
                run_gate=task.run_gate,
            )
            remote = await client.create_task(dispatch)
            for item, body in staged_inputs:
                await client.upload_input(
                    remote.id,
                    item.path,
                    body,
                    size=item.size,
                    sha256=item.sha256,
                )
            remote = await client.start_task(remote.id)
        except (ArtifactVerificationError, OSError) as error:
            attempt.error = {"code": "input_verification_failed", "message": str(error)}
            self._set_attempt_status(attempt, TaskStatus.ARTIFACT_FAILED)
            return
        except (NodeClientError, TunnelError) as error:
            self._block_attempt(attempt, error)
            return
        if remote.id != attempt.id:
            attempt.error = {"code": "node_protocol_error", "message": "节点返回的派发 ID 不匹配"}
            self._set_attempt_status(attempt, TaskStatus.BLOCKED)
            return
        attempt.error = None
        attempt.started_at = attempt.started_at or datetime.now(timezone.utc)
        self._set_attempt_status(attempt, TaskStatus.RUNNING)

    async def _collect(
        self,
        run: Run,
        workflow: Workflow,
        task: Task,
        attempt: TaskAttempt,
        needs_review: bool = False,
    ) -> None:
        try:
            client = await self._client_for_attempt(attempt)
        except (NodeClientError, TunnelError) as error:
            self._block_attempt(attempt, error)
            return
        try:
            remote_manifest = await client.artifacts(attempt.id)
            expected = {output.path for output in task.expected_outputs}
            received = {entry.path for entry in remote_manifest.artifacts}
            if expected and expected != received:
                raise ArtifactVerificationError("远程产物清单与预期产出不一致")
            entries = [
                ArtifactEntry(
                    task_id=task.id,
                    path=entry.path,
                    media_type="application/octet-stream",
                    size=entry.size,
                    sha256=entry.sha256,
                )
                for entry in remote_manifest.artifacts
            ]
            if not entries:
                raise ArtifactVerificationError("远程产物清单为空")
            for entry in entries:
                relative = PurePosixPath(entry.path)
                if relative.is_absolute() or ".." in relative.parts:
                    raise ArtifactVerificationError(f"产物路径不安全：{entry.path}")
                await self.artifacts.download_verified_artifact(
                    workflow.project_id, run.id, task.id, attempt.id, entry, client
                )
            local_entries = [
                entry.model_copy(update={"path": f"runs/{run.id}/tasks/{task.id}/artifacts/{entry.path}"})
                for entry in entries
            ]
            manifest = ArtifactManifest(run_id=run.id, task_id=task.id, artifacts=local_entries)
            self.artifacts.verify_manifest(workflow.project_id, manifest)
        except (ArtifactVerificationError, UnsafePathError, NodeClientError) as error:
            attempt.error = {"code": "artifact_verification_failed", "message": str(error)}
            self._set_attempt_status(attempt, TaskStatus.ARTIFACT_FAILED)
            return
        previous = attempt.status
        attempt.result_manifest = manifest.model_dump(mode="json")
        attempt.completed_at = datetime.now(timezone.utc)
        attempt.error = None
        attempt.status = transition_task(
            previous,
            TaskStatus.NEEDS_REVIEW if needs_review else TaskStatus.SUCCESS,
        )
        artifacts = [
            Artifact(
                id=f"{attempt.id}:{entry.path}",
                run_id=run.id,
                task_id=task.id,
                attempt_id=attempt.id,
                relative_path=entry.path,
                media_type=entry.media_type,
                size=entry.size,
                sha256=entry.sha256,
            )
            for entry in manifest.artifacts
        ]
        self.runs.commit_attempt_success(
            attempt,
            artifacts,
            self._event_payload(attempt, previous=previous.value),
        )
        # SUCCESS path bypasses _set_attempt_status; still release owned tunnel.
        asyncio.create_task(self._release_attempt_tunnel(attempt.id))

    async def _cancel_remote(self, attempt: TaskAttempt) -> None:
        try:
            client = await self._client_for_attempt(attempt)
            remote = await client.cancel_task(attempt.id)
        except (NodeClientError, TunnelError) as error:
            self._record_cancel_error(attempt, error)
            return
        attempt.error = None
        if remote.status in {"cancelled", "stopped"}:
            self._set_attempt_status(attempt, TaskStatus.CANCELLED)
        else:
            self.runs.update_attempt(attempt)

    def _record_cancel_error(self, attempt: TaskAttempt, error: Exception) -> None:
        if isinstance(error, TunnelError):
            attempt.error = {"code": error.code, "message": str(error)}
        elif isinstance(error, NodeClientError):
            attempt.error = {"code": "cancel_failed", "message": str(error)}
        else:
            attempt.error = {"code": "cancel_failed", "message": str(error)}
        self.runs.update_attempt(attempt)
        self._event(attempt.run_id, "task.cancel_failed", attempt, error=attempt.error)

    def _settle_cancellation(self, run: Run) -> None:
        attempts = self.runs.latest_attempts(run.id)
        cancellation_settled = _TERMINAL_TASKS | {
            TaskStatus.FAILED,
            TaskStatus.ARTIFACT_FAILED,
            TaskStatus.DISPATCH_FAILED,
        }
        if not attempts or all(attempt.status in cancellation_settled for attempt in attempts.values()):
            run.completed_at = datetime.now(timezone.utc)
            self._set_run_status(run, RunStatus.CANCELLED)

    def _settle_run(self, run: Run, workflow: Workflow) -> None:
        attempts = self.runs.latest_attempts(run.id)
        if len(attempts) == len(workflow.tasks) and all(
            attempt.status in {TaskStatus.SUCCESS, TaskStatus.SKIPPED, TaskStatus.NEEDS_REVIEW}
            for attempt in attempts.values()
        ):
            artifacts = [artifact.model_dump(mode="json") for artifact in self.artifact_repository.list_for_run(run.id)]
            self.artifacts.write_delivery_manifest(workflow.project_id, run.id, artifacts)
            run.completed_at = datetime.now(timezone.utc)
            needs_review = any(attempt.status is TaskStatus.NEEDS_REVIEW for attempt in attempts.values())
            self._set_run_status(
                run,
                RunStatus.SUCCESS_WITH_WARNINGS if needs_review else RunStatus.SUCCESS,
            )
            return
        can_progress = bool(ready_tasks(workflow, attempts, run.status, lambda _: True))
        has_active = any(attempt.status in _ACTIVE_TASKS for attempt in attempts.values())
        has_failure = any(attempt.status in _FAILURE_TASKS for attempt in attempts.values())
        has_pending_retry = any(
            attempt.status in {TaskStatus.FAILED, TaskStatus.ARTIFACT_FAILED, TaskStatus.DISPATCH_FAILED}
            and attempt.attempt < self._task(workflow, task_id).retry_policy.max_attempts
            for task_id, attempt in attempts.items()
        )
        if has_failure and not has_active and not can_progress and not has_pending_retry:
            self._set_run_status(run, RunStatus.BLOCKED)

    def _restore_transient_attempts(self, run_id: str) -> None:
        for attempt in self.runs.latest_attempts(run_id).values():
            if attempt.status is TaskStatus.BLOCKED and self._is_transient(attempt):
                attempt.error = None
                self._set_attempt_status(attempt, TaskStatus.READY)

    def _has_transient_blocked_attempt(self, run_id: str) -> bool:
        return any(
            attempt.status is TaskStatus.BLOCKED and self._is_transient(attempt)
            for attempt in self.runs.latest_attempts(run_id).values()
        )

    @staticmethod
    def _is_transient(attempt: TaskAttempt) -> bool:
        return attempt.error is not None and attempt.error.get("code") in _TRANSIENT_ERROR_CODES

    def _block_attempt(self, attempt: TaskAttempt, error: Exception) -> None:
        if isinstance(error, TunnelError):
            attempt.error = {"code": error.code, "message": str(error), **error.extra}
        elif isinstance(error, NodeClientError):
            attempt.error = {"code": error.code, "message": str(error)}
        else:
            attempt.error = {"code": "node_connection_error", "message": str(error)}
        self._set_attempt_status(attempt, TaskStatus.BLOCKED)

    def _set_run_status(self, run: Run, status: RunStatus) -> None:
        if run.status is status:
            return
        previous = run.status
        run.status = transition_run(previous, status)
        self.runs.update(run)
        self.events.append(run.id, "run.status_changed", {"previous": previous.value, "status": status.value})

    def _set_attempt_status(self, attempt: TaskAttempt, status: TaskStatus) -> None:
        if attempt.status is status:
            self.runs.update_attempt(attempt)
            return
        previous = attempt.status
        attempt.status = transition_task(previous, status)
        if status in _TERMINAL_TASKS | {TaskStatus.FAILED, TaskStatus.ARTIFACT_FAILED}:
            attempt.completed_at = attempt.completed_at or datetime.now(timezone.utc)
        self.runs.update_attempt(attempt)
        self._event(attempt.run_id, "task.status_changed", attempt, previous=previous.value)
        if previous in _TUNNEL_OWNER_STATUSES and status not in _TUNNEL_OWNER_STATUSES:
            # Fire-and-forget close is unsafe under the step lock; schedule cleanup.
            asyncio.create_task(self._release_attempt_tunnel(attempt.id))

    def _event(self, run_id: str, event_type: str, attempt: TaskAttempt, **extra: object) -> None:
        self.events.append(run_id, event_type, self._event_payload(attempt, **extra))

    @staticmethod
    def _event_payload(attempt: TaskAttempt, **extra: object) -> dict[str, object]:
        return {
            "task_id": attempt.task_id,
            "attempt": attempt.attempt,
            "attempt_id": attempt.id,
            "node_id": attempt.node_id,
            "status": attempt.status.value,
            **extra,
        }

    def _ensure_loop(self, run_id: str) -> None:
        run = self._run(run_id)
        if run.status in _TERMINAL_RUNS:
            return
        existing = self._loops.get(run_id)
        if existing is None or existing.done():
            self._loops[run_id] = asyncio.create_task(self._coordinate(run_id))

    async def _coordinate(self, run_id: str) -> None:
        current = asyncio.current_task()
        try:
            while self._run(run_id).status not in _TERMINAL_RUNS:
                await asyncio.sleep(self.poll_interval)
                await self.reconcile(run_id)
        finally:
            if self._loops.get(run_id) is current:
                self._loops.pop(run_id, None)

    def _step_lock(self, run_id: str) -> asyncio.Lock:
        return self._step_locks.setdefault(run_id, asyncio.Lock())

    @staticmethod
    def _new_attempt(run_id: str, task: Task, number: int) -> TaskAttempt:
        return TaskAttempt(
            id=f"{run_id}:{task.id}:{number}",
            run_id=run_id,
            task_id=task.id,
            attempt=number,
        )

    def _run(self, run_id: str) -> Run:
        run = self.runs.get(run_id)
        if run is None:
            raise KeyError(run_id)
        return run

    def _workflow(self, workflow_id: str) -> Workflow:
        workflow = self.workflows.get(workflow_id)
        if workflow is None:
            raise KeyError(workflow_id)
        return workflow

    @staticmethod
    def _task(workflow: Workflow, task_id: str) -> Task:
        try:
            return next(task for task in workflow.tasks if task.id == task_id)
        except StopIteration:
            raise KeyError(task_id) from None

    def _client(self, node_id: str | None) -> NodeClient:
        if node_id is None or node_id not in self.node_clients:
            raise NodeProtocolError("node_protocol_error", "节点客户端当前不可用")
        return self.node_clients[node_id]

    async def _client_for_attempt(
        self,
        attempt: TaskAttempt,
        *,
        node: HermesNode | None = None,
    ) -> NodeClient:
        cached = self._attempt_clients.get(attempt.id)
        if cached is not None:
            return cached
        if attempt.node_id is None and node is None:
            raise NodeProtocolError("node_protocol_error", "节点客户端当前不可用")
        node_id = node.id if node is not None else attempt.node_id
        base = self._client(node_id)
        resolved = node or self.nodes.get(node_id or "")
        if resolved is None:
            # Fall back to the static registry client (local / tests without node row).
            self._attempt_clients[attempt.id] = base
            return base
        try:
            endpoint = await self.tunnels.open(attempt.id, resolved)
        except TunnelError:
            raise
        client = base.rebinding(endpoint.base_url) if endpoint.base_url != base.base_url else base
        self._attempt_clients[attempt.id] = client
        return client

    async def _release_attempt_tunnel(self, owner_id: str) -> None:
        self._attempt_clients.pop(owner_id, None)
        try:
            await self.tunnels.close(owner_id)
        except Exception:
            # Best-effort cleanup; never surface tunnel teardown errors into task status.
            return
