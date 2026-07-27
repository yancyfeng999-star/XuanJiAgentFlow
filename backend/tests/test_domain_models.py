from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from xuanji.domain.enums import (
    RunStatus,
    TaskStatus,
    WorkflowStatus,
    ensure_run_transition,
    ensure_task_transition,
)
from xuanji.domain.models import (
    Artifact,
    HermesNode,
    Project,
    Run,
    Task,
    TaskAttempt,
    Workflow,
)


def now():
    return datetime.now(timezone.utc)


def test_core_models_accept_valid_data():
    project = Project(id="project_1", name="Demo", root_path="/tmp/demo")
    task = Task(id="task_1", workflow_id="workflow_1", title="Research")
    workflow = Workflow(
        id="workflow_1",
        project_id=project.id,
        version=1,
        goal="Research a market",
        tasks=[task],
    )
    run = Run(id="run_1", workflow_id=workflow.id)
    attempt = TaskAttempt(id="attempt_1", run_id=run.id, task_id=task.id, attempt=1)
    node = HermesNode(id="node_1", name="Local", kind="local", api_url="http://127.0.0.1:8001")
    artifact = Artifact(
        id="artifact_1",
        run_id=run.id,
        task_id=task.id,
        relative_path="runs/run_1/tasks/task_1/artifacts/report.md",
        media_type="text/markdown",
        size=12,
        sha256="a" * 64,
    )

    assert workflow.status is WorkflowStatus.DRAFT
    assert run.status is RunStatus.PENDING
    assert attempt.status is TaskStatus.PENDING
    assert node.max_concurrency == 1
    assert artifact.sha256 == "a" * 64
    assert project.created_at <= now()


@pytest.mark.parametrize(
    ("factory", "kwargs"),
    [
        (Project, {"id": "", "name": "Demo", "root_path": "/tmp/demo"}),
        (Workflow, {"id": "w", "project_id": "p", "version": 0, "goal": "g"}),
        (TaskAttempt, {"id": "a", "run_id": "r", "task_id": "t", "attempt": 0}),
        (HermesNode, {"id": "n", "name": "N", "kind": "local", "api_url": "not-a-url"}),
        (Artifact, {"id": "a", "run_id": "r", "task_id": "t", "relative_path": "a", "media_type": "text/plain", "size": -1, "sha256": "bad"}),
    ],
)
def test_models_reject_invalid_data(factory, kwargs):
    with pytest.raises(ValidationError):
        factory(**kwargs)


def test_workflow_and_run_status_are_separate_enums():
    assert WorkflowStatus.REVIEWED.value == "reviewed"
    assert RunStatus.RUNNING.value == "running"
    with pytest.raises(ValidationError):
        Workflow(id="w", project_id="p", version=1, goal="g", status="running")


def test_state_transition_guards_reject_illegal_transitions():
    ensure_task_transition(TaskStatus.PENDING, TaskStatus.READY)
    ensure_run_transition(RunStatus.PENDING, RunStatus.RUNNING)

    with pytest.raises(ValueError, match="Illegal task status transition"):
        ensure_task_transition(TaskStatus.SUCCESS, TaskStatus.RUNNING)
    with pytest.raises(ValueError, match="Illegal run status transition"):
        ensure_run_transition(RunStatus.SUCCESS, RunStatus.RUNNING)
