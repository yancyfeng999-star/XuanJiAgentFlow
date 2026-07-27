import pytest
from pydantic import ValidationError

from xuanji.domain.models import Task, Workflow


def make_task(task_id: str, dependencies: list[str] | None = None) -> Task:
    return Task(
        id=task_id,
        workflow_id="workflow_1",
        title=task_id,
        dependencies=dependencies or [],
    )


def test_workflow_returns_stable_topological_order_and_parallel_layers():
    workflow = Workflow(
        id="workflow_1",
        project_id="project_1",
        version=1,
        goal="Build report",
        tasks=[
            make_task("a"),
            make_task("b"),
            make_task("c", ["a", "b"]),
            make_task("d", ["c"]),
        ],
    )

    assert workflow.topological_order() == ["a", "b", "c", "d"]
    assert workflow.parallel_layers() == [["a", "b"], ["c"], ["d"]]


def test_workflow_rejects_cycle():
    with pytest.raises(ValidationError, match="cycle"):
        Workflow(
            id="workflow_1",
            project_id="project_1",
            version=1,
            goal="Bad graph",
            tasks=[make_task("a", ["b"]), make_task("b", ["a"])],
        )


def test_workflow_rejects_missing_dependency():
    with pytest.raises(ValidationError, match="missing dependency"):
        Workflow(
            id="workflow_1",
            project_id="project_1",
            version=1,
            goal="Bad graph",
            tasks=[make_task("a", ["missing"])],
        )


def test_workflow_rejects_duplicate_task_id():
    with pytest.raises(ValidationError, match="duplicate task id"):
        Workflow(
            id="workflow_1",
            project_id="project_1",
            version=1,
            goal="Bad graph",
            tasks=[make_task("a"), make_task("a")],
        )


def test_workflow_rejects_task_bound_to_other_workflow():
    task = make_task("a")
    task.workflow_id = "other"
    with pytest.raises(ValidationError, match="workflow_id"):
        Workflow(
            id="workflow_1",
            project_id="project_1",
            version=1,
            goal="Bad graph",
            tasks=[task],
        )
