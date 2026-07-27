import sqlite3
from datetime import datetime, timezone

import pytest

from xuanji.domain.enums import RunStatus, TaskStatus, WorkflowStatus
from xuanji.domain.models import Project, Run, Task, TaskAttempt, Workflow
from xuanji.storage.database import Database
from xuanji.storage.migrations import CURRENT_SCHEMA_VERSION, migrate
from xuanji.storage.repositories import EventRepository, ProjectRepository, RunRepository, WorkflowRepository


def timestamp():
    return datetime.now(timezone.utc)


@pytest.fixture
def database(tmp_path):
    db = Database(tmp_path / "xuanji.db")
    migrate(db)
    yield db
    db.close()


def test_migration_creates_versioned_schema_and_is_idempotent(tmp_path):
    db = Database(tmp_path / "xuanji.db")
    migrate(db)
    migrate(db)

    tables = {
        row["name"]
        for row in db.connection.execute("SELECT name FROM sqlite_master WHERE type='table'")
    }
    assert {
        "schema_version",
        "projects",
        "workflows",
        "tasks",
        "runs",
        "task_attempts",
        "nodes",
        "artifacts",
        "events",
    } <= tables
    version = db.connection.execute("SELECT MAX(version) AS version FROM schema_version").fetchone()
    assert version["version"] == CURRENT_SCHEMA_VERSION


def test_explicit_transaction_rolls_back_on_error(database):
    with pytest.raises(sqlite3.IntegrityError):
        with database.transaction() as connection:
            connection.execute(
                "INSERT INTO projects (id,name,root_path,created_at,updated_at) VALUES (?,?,?,?,?)",
                ("p1", "First", "/tmp/first", timestamp().isoformat(), timestamp().isoformat()),
            )
            connection.execute(
                "INSERT INTO projects (id,name,root_path,created_at,updated_at) VALUES (?,?,?,?,?)",
                ("p1", "Duplicate", "/tmp/duplicate", timestamp().isoformat(), timestamp().isoformat()),
            )

    assert database.connection.execute("SELECT COUNT(*) AS count FROM projects").fetchone()["count"] == 0


def test_create_and_update_project(database):
    repository = ProjectRepository(database)
    project = Project(id="p1", name="First", root_path="/tmp/first")
    repository.create(project)
    project.name = "Renamed"
    repository.update(project)

    restored = repository.get("p1")
    assert restored is not None
    assert restored.name == "Renamed"
    assert repository.list()[0].id == "p1"


def test_save_multiple_workflow_versions_and_tasks_atomically(database):
    project_repository = ProjectRepository(database)
    workflow_repository = WorkflowRepository(database)
    project_repository.create(Project(id="p1", name="First", root_path="/tmp/first"))

    first = Workflow(
        id="w1",
        project_id="p1",
        version=1,
        goal="Goal v1",
        tasks=[Task(id="t1", workflow_id="w1", title="One")],
    )
    second = Workflow(
        id="w2",
        project_id="p1",
        version=2,
        goal="Goal v2",
        status=WorkflowStatus.REVIEWED,
        tasks=[
            Task(id="t2", workflow_id="w2", title="Two"),
            Task(id="t3", workflow_id="w2", title="Three", dependencies=["t2"]),
        ],
    )
    workflow_repository.save(first)
    workflow_repository.save(second)

    versions = workflow_repository.list_versions("p1")
    assert [workflow.version for workflow in versions] == [1, 2]
    restored = workflow_repository.get("w2")
    assert restored is not None
    assert restored.status is WorkflowStatus.REVIEWED
    assert restored.topological_order() == ["t2", "t3"]


def test_restore_non_terminal_runs_with_latest_attempts(database):
    projects = ProjectRepository(database)
    workflows = WorkflowRepository(database)
    runs = RunRepository(database)
    projects.create(Project(id="p1", name="First", root_path="/tmp/first"))
    workflows.save(
        Workflow(
            id="w1",
            project_id="p1",
            version=1,
            goal="Goal",
            tasks=[Task(id="t1", workflow_id="w1", title="One")],
        )
    )
    runs.create(Run(id="r1", workflow_id="w1", status=RunStatus.RUNNING))
    runs.create(Run(id="r2", workflow_id="w1", status=RunStatus.SUCCESS))
    runs.save_attempt(TaskAttempt(id="a1", run_id="r1", task_id="t1", attempt=1, status=TaskStatus.FAILED))
    runs.save_attempt(TaskAttempt(id="a2", run_id="r1", task_id="t1", attempt=2, status=TaskStatus.RUNNING))

    recovered = runs.list_recoverable()
    assert [item.run.id for item in recovered] == ["r1"]
    assert recovered[0].latest_attempts["t1"].id == "a2"


def test_events_use_monotonic_ids_and_keyset_pagination(database):
    events = EventRepository(database)
    first = events.append("r1", "run.created", {"status": "pending"})
    second = events.append("r1", "task.ready", {"task_id": "t1"})
    events.append("r2", "run.created", {"status": "pending"})
    third = events.append("r1", "task.started", {"task_id": "t1"})

    page = events.list_for_run("r1", after_event_id=first.event_id, limit=1)
    assert [event.event_id for event in page] == [second.event_id]
    assert events.list_for_run("r1", after_event_id=second.event_id)[0].event_id == third.event_id
    assert first.event_id < second.event_id < third.event_id
