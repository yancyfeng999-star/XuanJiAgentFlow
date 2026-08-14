from __future__ import annotations

import sys
from contextlib import AsyncExitStack
from pathlib import Path

import httpx
import pytest

ROOT = Path(__file__).resolve().parents[2]
NODE_AGENT_DIR = ROOT / "node-agent"
if str(NODE_AGENT_DIR) not in sys.path:
    sys.path.insert(0, str(NODE_AGENT_DIR))

from app import create_app as create_node_agent_app  # noqa: E402

from xuanji.artifacts.manager import ArtifactManager  # noqa: E402
from xuanji.domain.enums import NodeKind, NodeStatus, RunStatus, WorkflowStatus  # noqa: E402
from xuanji.domain.models import ExpectedOutput, HermesNode, Project, Run, Task, Workflow  # noqa: E402
from xuanji.execution.manager import ExecutionManager  # noqa: E402
from xuanji.nodes import NodeClient  # noqa: E402
from xuanji.storage.database import Database  # noqa: E402
from xuanji.storage.migrations import migrate  # noqa: E402
from xuanji.storage.repositories import NodeRepository, ProjectRepository, RunRepository, WorkflowRepository  # noqa: E402


class FakeHermes:
    def __init__(self) -> None:
        self.runs: dict[str, dict] = {}
        self.prompts: dict[str, str] = {}

    def health(self) -> dict:
        return {"models": ["fake-hermes"], "tools": ["terminal"]}

    def create_run(self, prompt: str, task_id: str | None = None) -> dict:
        run_id = task_id or f"run-{len(self.runs) + 1}"
        self.prompts[run_id] = prompt
        self.runs[run_id] = {
            "id": run_id,
            "status": "completed",
            "output": f"HERMES RESULT\n{prompt}",
        }
        return self.runs[run_id]

    def get_run(self, run_id: str) -> dict:
        return self.runs[run_id]

    def stop_run(self, run_id: str) -> dict:
        self.runs[run_id]["status"] = "stopped"
        return self.runs[run_id]


@pytest.mark.asyncio
async def test_coordinator_real_node_agent_fake_hermes_transfers_dependency_content(
    tmp_path: Path,
) -> None:
    token = "real-agent-test-token"
    node_app = create_node_agent_app(
        root=tmp_path / "node-tasks",
        token=token,
        hermes_url="http://fake-hermes",
    )
    fake_hermes = FakeHermes()
    node_app.state.executor.client = fake_hermes

    async with AsyncExitStack() as stack:
        transport_client = await stack.enter_async_context(
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=node_app),
                base_url="http://real-node-agent.test",
            )
        )
        node_client = NodeClient(
            "http://real-node-agent.test",
            token,
            client=transport_client,
        )
        database = Database(tmp_path / "coordinator.db")
        migrate(database)
        stack.callback(database.close)
        artifacts = ArtifactManager(tmp_path / "managed-projects")
        project = Project(
            id="project-real-agent",
            name="Real Agent Integration",
            root_path=str(tmp_path / "project"),
        )
        ProjectRepository(database).create(project)
        project_root = artifacts.create_project(project)
        workflow = Workflow(
            id="workflow-real-agent",
            project_id=project.id,
            version=1,
            goal="Prove dependency content transfer",
            status=WorkflowStatus.REVIEWED,
            tasks=[
                Task(
                    id="research",
                    workflow_id="workflow-real-agent",
                    title="Research",
                    prompt="Produce marker UPSTREAM-REAL-AGENT-91.",
                    expected_outputs=[ExpectedOutput(path="research.md")],
                ),
                Task(
                    id="report",
                    workflow_id="workflow-real-agent",
                    title="Report",
                    prompt="Write a report using only verified inputs.",
                    dependencies=["research"],
                    expected_outputs=[ExpectedOutput(path="report.md")],
                ),
            ],
        )
        WorkflowRepository(database).save(workflow)
        run = Run(id="run-real-agent", workflow_id=workflow.id)
        runs = RunRepository(database)
        runs.create(run)
        artifacts.create_run(project.id, run.id, workflow.id)
        NodeRepository(database).upsert(
            HermesNode(
                id="real-agent",
                name="Real Node Agent",
                kind=NodeKind.LOCAL,
                api_url="http://real-node-agent.test",
                status=NodeStatus.ONLINE,
                capabilities_json={"models": ["fake-hermes"], "tools": ["terminal"]},
            )
        )
        manager = ExecutionManager(
            database,
            artifacts,
            {"real-agent": node_client},
            poll_interval=60,
        )
        stack.push_async_callback(manager.close)

        await manager.start(run.id)
        await manager.reconcile(run.id)
        await manager.reconcile(run.id)

        assert runs.get(run.id).status is RunStatus.SUCCESS
        report_prompt = fake_hermes.prompts["run-real-agent:report:1"]
        assert "UPSTREAM-REAL-AGENT-91" in report_prompt
        report = (
            project_root
            / "runs"
            / run.id
            / "tasks"
            / "report"
            / "artifacts"
            / "report.md"
        )
        assert "UPSTREAM-REAL-AGENT-91" in report.read_text(encoding="utf-8")
        log_lines = (
            project_root / "runs" / run.id / "tasks" / "report" / "logs.jsonl"
        ).read_text(encoding="utf-8")
        assert "input_uploaded" in log_lines
        assert "task_succeeded" in log_lines


@pytest.mark.asyncio
async def test_manual_verify_propagates_needs_review_to_run(tmp_path: Path) -> None:
    token = "real-agent-test-token"
    node_app = create_node_agent_app(
        root=tmp_path / "node-tasks",
        token=token,
        hermes_url="http://fake-hermes",
    )
    node_app.state.executor.client = FakeHermes()

    async with AsyncExitStack() as stack:
        transport_client = await stack.enter_async_context(
            httpx.AsyncClient(
                transport=httpx.ASGITransport(app=node_app),
                base_url="http://real-node-agent.test",
            )
        )
        node_client = NodeClient("http://real-node-agent.test", token, client=transport_client)
        database = Database(tmp_path / "coordinator.db")
        migrate(database)
        stack.callback(database.close)
        artifacts = ArtifactManager(tmp_path / "managed-projects")
        project = Project(id="project-verify", name="Verify", root_path=str(tmp_path / "project"))
        ProjectRepository(database).create(project)
        artifacts.create_project(project)
        workflow = Workflow(
            id="workflow-verify",
            project_id=project.id,
            version=1,
            goal="Prove manual verify semantics",
            status=WorkflowStatus.REVIEWED,
            tasks=[
                Task(
                    id="report",
                    workflow_id="workflow-verify",
                    title="Report",
                    prompt="Write a report.",
                    expected_outputs=[ExpectedOutput(path="report.md")],
                    verify=[{"kind": "manual", "value": "人工确认报告质量"}],
                ),
            ],
        )
        WorkflowRepository(database).save(workflow)
        run = Run(id="run-verify", workflow_id=workflow.id)
        runs = RunRepository(database)
        runs.create(run)
        artifacts.create_run(project.id, run.id, workflow.id)
        NodeRepository(database).upsert(
            HermesNode(
                id="real-agent",
                name="Real Node Agent",
                kind=NodeKind.LOCAL,
                api_url="http://real-node-agent.test",
                status=NodeStatus.ONLINE,
                capabilities_json={"models": ["fake-hermes"], "tools": ["terminal"]},
            )
        )
        manager = ExecutionManager(database, artifacts, {"real-agent": node_client}, poll_interval=60)
        stack.push_async_callback(manager.close)

        await manager.start(run.id)
        await manager.reconcile(run.id)
        await manager.reconcile(run.id)

        attempt = runs.latest_attempts(run.id)["report"]
        assert attempt.status.value == "needs_review"
        assert runs.get(run.id).status is RunStatus.SUCCESS_WITH_WARNINGS

        payload_run = runs.get(run.id)
        assert payload_run.completed_at is not None
