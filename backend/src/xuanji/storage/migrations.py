from __future__ import annotations

from collections.abc import Callable

from .database import Database

CURRENT_SCHEMA_VERSION = 3

MIGRATION_1 = """
CREATE TABLE projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    root_path TEXT NOT NULL UNIQUE,
    active_workflow_version INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE TABLE workflows (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    version INTEGER NOT NULL CHECK(version >= 1),
    goal TEXT NOT NULL,
    planner_provider TEXT,
    planner_model TEXT,
    status TEXT NOT NULL CHECK(status IN ('draft','reviewed','archived')),
    graph_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(project_id, version)
);
CREATE TABLE tasks (
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    prompt TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    dependencies_json TEXT NOT NULL,
    execution_policy_json TEXT NOT NULL,
    retry_policy_json TEXT NOT NULL,
    expected_outputs_json TEXT NOT NULL,
    ui_position_json TEXT NOT NULL,
    PRIMARY KEY(workflow_id, id)
);
CREATE INDEX idx_tasks_workflow ON tasks(workflow_id);
CREATE TABLE runs (
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id),
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_runs_status ON runs(status);
CREATE TABLE nodes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('local','remote')),
    api_url TEXT NOT NULL,
    ssh_host TEXT,
    ssh_port INTEGER,
    ssh_user TEXT,
    ssh_key_path TEXT,
    status TEXT NOT NULL,
    capabilities_json TEXT NOT NULL,
    max_concurrency INTEGER NOT NULL,
    running_tasks INTEGER NOT NULL,
    success_rate REAL NOT NULL,
    last_seen_at TEXT
);
CREATE TABLE task_attempts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    node_id TEXT REFERENCES nodes(id),
    attempt INTEGER NOT NULL CHECK(attempt >= 1),
    status TEXT NOT NULL,
    started_at TEXT,
    completed_at TEXT,
    error_json TEXT,
    result_manifest_json TEXT,
    UNIQUE(run_id, task_id, attempt)
);
CREATE INDEX idx_attempts_run_task ON task_attempts(run_id, task_id, attempt DESC);
CREATE TABLE artifacts (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    task_id TEXT NOT NULL,
    attempt_id TEXT REFERENCES task_attempts(id),
    relative_path TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size INTEGER NOT NULL CHECK(size >= 0),
    sha256 TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE(run_id, relative_path)
);
CREATE TABLE events (
    event_id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX idx_events_run_id ON events(run_id, event_id);
"""

MIGRATION_2 = """
CREATE TABLE app_config (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
"""


def migration_3(connection) -> None:
    columns = connection.execute("PRAGMA table_info(tasks)").fetchall()
    primary_key = [row["name"] for row in sorted(columns, key=lambda row: row["pk"]) if row["pk"]]
    if primary_key == ["workflow_id", "id"]:
        return

    connection.execute(
        """CREATE TABLE tasks_v3 (
        workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
        id TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        prompt TEXT NOT NULL,
        agent_type TEXT NOT NULL,
        dependencies_json TEXT NOT NULL,
        execution_policy_json TEXT NOT NULL,
        retry_policy_json TEXT NOT NULL,
        expected_outputs_json TEXT NOT NULL,
        ui_position_json TEXT NOT NULL,
        PRIMARY KEY(workflow_id, id)
        )"""
    )
    connection.execute("INSERT INTO tasks_v3 SELECT workflow_id,id,title,description,prompt,agent_type,dependencies_json,execution_policy_json,retry_policy_json,expected_outputs_json,ui_position_json FROM tasks")
    connection.execute(
        """CREATE TABLE task_attempts_v3 (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        node_id TEXT REFERENCES nodes(id),
        attempt INTEGER NOT NULL CHECK(attempt >= 1),
        status TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_json TEXT,
        result_manifest_json TEXT,
        UNIQUE(run_id, task_id, attempt)
        )"""
    )
    connection.execute("INSERT INTO task_attempts_v3 SELECT * FROM task_attempts")
    connection.execute(
        """CREATE TABLE artifacts_v3 (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL,
        attempt_id TEXT REFERENCES task_attempts_v3(id),
        relative_path TEXT NOT NULL,
        media_type TEXT NOT NULL,
        size INTEGER NOT NULL CHECK(size >= 0),
        sha256 TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(run_id, relative_path)
        )"""
    )
    connection.execute("INSERT INTO artifacts_v3 SELECT * FROM artifacts")
    connection.execute("DROP TABLE artifacts")
    connection.execute("DROP TABLE task_attempts")
    connection.execute("DROP TABLE tasks")
    connection.execute("ALTER TABLE tasks_v3 RENAME TO tasks")
    connection.execute("ALTER TABLE task_attempts_v3 RENAME TO task_attempts")
    connection.execute("ALTER TABLE artifacts_v3 RENAME TO artifacts")
    connection.execute("CREATE INDEX idx_tasks_workflow ON tasks(workflow_id)")
    connection.execute("CREATE INDEX idx_attempts_run_task ON task_attempts(run_id, task_id, attempt DESC)")


MIGRATIONS: dict[int, str | Callable] = {1: MIGRATION_1, 2: MIGRATION_2, 3: migration_3}


def migrate(database: Database) -> None:
    database.connection.execute(
        "CREATE TABLE IF NOT EXISTS schema_version (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
    )
    row = database.connection.execute("SELECT COALESCE(MAX(version), 0) AS version FROM schema_version").fetchone()
    current = int(row["version"])
    for version in range(current + 1, CURRENT_SCHEMA_VERSION + 1):
        migration = MIGRATIONS[version]
        with database.transaction() as connection:
            if callable(migration):
                migration(connection)
            else:
                for statement in migration.split(";"):
                    if statement.strip():
                        connection.execute(statement)
            connection.execute("INSERT INTO schema_version(version) VALUES (?)", (version,))
