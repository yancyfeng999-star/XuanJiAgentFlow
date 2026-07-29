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


def test_migration_upgrades_global_task_ids_without_losing_run_records(tmp_path):
    db = Database(tmp_path / "legacy.db")
    created = timestamp().isoformat()
    with db.transaction() as connection:
        connection.execute("CREATE TABLE schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        connection.execute("INSERT INTO schema_version(version) VALUES (1),(2)")
        connection.execute("CREATE TABLE projects (id TEXT PRIMARY KEY,name TEXT NOT NULL,root_path TEXT NOT NULL UNIQUE,active_workflow_version INTEGER,created_at TEXT NOT NULL,updated_at TEXT NOT NULL)")
        connection.execute("CREATE TABLE workflows (id TEXT PRIMARY KEY,project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,version INTEGER NOT NULL,goal TEXT NOT NULL,planner_provider TEXT,planner_model TEXT,status TEXT NOT NULL,graph_json TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(project_id,version))")
        connection.execute("CREATE TABLE tasks (id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,title TEXT NOT NULL,description TEXT NOT NULL,prompt TEXT NOT NULL,agent_type TEXT NOT NULL,dependencies_json TEXT NOT NULL,execution_policy_json TEXT NOT NULL,retry_policy_json TEXT NOT NULL,expected_outputs_json TEXT NOT NULL,ui_position_json TEXT NOT NULL)")
        connection.execute("CREATE TABLE runs (id TEXT PRIMARY KEY,workflow_id TEXT NOT NULL REFERENCES workflows(id),status TEXT NOT NULL,started_at TEXT,completed_at TEXT,created_at TEXT NOT NULL)")
        connection.execute("CREATE TABLE nodes (id TEXT PRIMARY KEY,name TEXT NOT NULL,kind TEXT NOT NULL,api_url TEXT NOT NULL,ssh_host TEXT,ssh_port INTEGER,ssh_user TEXT,ssh_key_path TEXT,status TEXT NOT NULL,capabilities_json TEXT NOT NULL,max_concurrency INTEGER NOT NULL,running_tasks INTEGER NOT NULL,success_rate REAL NOT NULL,last_seen_at TEXT)")
        connection.execute("CREATE TABLE task_attempts (id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,task_id TEXT NOT NULL,node_id TEXT REFERENCES nodes(id),attempt INTEGER NOT NULL,status TEXT NOT NULL,started_at TEXT,completed_at TEXT,error_json TEXT,result_manifest_json TEXT,UNIQUE(run_id,task_id,attempt))")
        connection.execute("CREATE TABLE artifacts (id TEXT PRIMARY KEY,run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,task_id TEXT NOT NULL,attempt_id TEXT REFERENCES task_attempts(id),relative_path TEXT NOT NULL,media_type TEXT NOT NULL,size INTEGER NOT NULL,sha256 TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(run_id,relative_path))")
        connection.execute("CREATE TABLE events (event_id INTEGER PRIMARY KEY AUTOINCREMENT,run_id TEXT NOT NULL,event_type TEXT NOT NULL,payload_json TEXT NOT NULL,created_at TEXT NOT NULL)")
        connection.execute("CREATE TABLE app_config (key TEXT PRIMARY KEY,value_json TEXT NOT NULL,updated_at TEXT NOT NULL)")
        connection.execute("INSERT INTO projects VALUES (?,?,?,?,?,?)", ("p1", "Legacy", "/tmp/legacy", 1, created, created))
        connection.execute("INSERT INTO workflows VALUES (?,?,?,?,?,?,?,?,?)", ("w1", "p1", 1, "Legacy", None, None, "draft", "{}", created))
        connection.execute("INSERT INTO tasks VALUES (?,?,?,?,?,?,?,?,?,?,?)", ("research", "w1", "Research", "", "", "general", "[]", '{"mode":"auto","node_id":null,"node_group":null,"required_models":[],"required_tools":[],"required_tags":[],"timeout_seconds":1800}', '{"max_attempts":3,"delay_seconds":1}', "[]", '{"x":0,"y":0}'))
        connection.execute("INSERT INTO runs VALUES (?,?,?,?,?,?)", ("r1", "w1", "running", None, None, created))
        connection.execute("INSERT INTO task_attempts VALUES (?,?,?,?,?,?,?,?,?,?)", ("a1", "r1", "research", None, 1, "running", None, None, None, None))
        connection.execute("INSERT INTO artifacts VALUES (?,?,?,?,?,?,?,?,?)", ("artifact-1", "r1", "research", "a1", "runs/r1/output.txt", "text/plain", 1, "0" * 64, created))

    migrate(db)

    assert tuple(db.connection.execute("SELECT id,workflow_id FROM tasks").fetchone()) == ("research", "w1")
    assert tuple(db.connection.execute("SELECT id,task_id FROM task_attempts").fetchone()) == ("a1", "research")
    assert tuple(db.connection.execute("SELECT id,attempt_id FROM artifacts").fetchone()) == ("artifact-1", "a1")
    db.close()


def test_tasks_are_keyed_within_workflow_and_run_records_keep_task_ids(database):
    task_columns = database.connection.execute("PRAGMA table_info(tasks)").fetchall()
    primary_key = [row["name"] for row in sorted(task_columns, key=lambda row: row["pk"]) if row["pk"]]
    assert primary_key == ["workflow_id", "id"]

    attempt_foreign_keys = database.connection.execute("PRAGMA foreign_key_list(task_attempts)").fetchall()
    artifact_foreign_keys = database.connection.execute("PRAGMA foreign_key_list(artifacts)").fetchall()
    assert {row["table"] for row in attempt_foreign_keys} == {"runs", "nodes"}
    assert {row["table"] for row in artifact_foreign_keys} == {"runs", "task_attempts"}


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


def test_save_multiple_workflow_versions_with_reused_task_ids(database):
    project_repository = ProjectRepository(database)
    workflow_repository = WorkflowRepository(database)
    project_repository.create(Project(id="p1", name="First", root_path="/tmp/first"))

    first = Workflow(
        id="w1",
        project_id="p1",
        version=1,
        goal="Goal v1",
        tasks=[Task(id="research", workflow_id="w1", title="Research v1")],
    )
    second = Workflow(
        id="w2",
        project_id="p1",
        version=2,
        goal="Goal v2",
        status=WorkflowStatus.REVIEWED,
        tasks=[Task(id="research", workflow_id="w2", title="Research v2")],
    )
    workflow_repository.save(first)
    workflow_repository.save(second)

    versions = workflow_repository.list_versions("p1")
    assert [workflow.version for workflow in versions] == [1, 2]
    assert versions[0].tasks[0].title == "Research v1"
    assert versions[1].tasks[0].title == "Research v2"
    assert workflow_repository.get_active("p1") == versions[1]
    assert workflow_repository.get("w1") == versions[0]
    assert workflow_repository.get("w2") == versions[1]


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
