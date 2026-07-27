from __future__ import annotations

from collections.abc import Callable

from .database import Database

CURRENT_SCHEMA_VERSION = 1

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
    id TEXT PRIMARY KEY,
    workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    prompt TEXT NOT NULL,
    agent_type TEXT NOT NULL,
    dependencies_json TEXT NOT NULL,
    execution_policy_json TEXT NOT NULL,
    retry_policy_json TEXT NOT NULL,
    expected_outputs_json TEXT NOT NULL,
    ui_position_json TEXT NOT NULL
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
    task_id TEXT NOT NULL REFERENCES tasks(id),
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
    task_id TEXT NOT NULL REFERENCES tasks(id),
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

MIGRATIONS: dict[int, str | Callable] = {1: MIGRATION_1}


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
