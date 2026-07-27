from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from xuanji.domain.enums import RunStatus
from xuanji.domain.models import Artifact, HermesNode, Project, Run, Task, TaskAttempt, Workflow

from .database import Database


def _json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"), default=str)


def _dump(model: Any) -> dict[str, Any]:
    return model.model_dump(mode="json")


class ProjectRepository:
    def __init__(self, database: Database):
        self.database = database

    def create(self, project: Project) -> None:
        data = _dump(project)
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO projects(id,name,root_path,active_workflow_version,created_at,updated_at) VALUES (?,?,?,?,?,?)",
                (data["id"], data["name"], data["root_path"], data["active_workflow_version"], data["created_at"], data["updated_at"]),
            )

    def update(self, project: Project) -> None:
        project.updated_at = datetime.now(timezone.utc)
        data = _dump(project)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                "UPDATE projects SET name=?,root_path=?,active_workflow_version=?,updated_at=? WHERE id=?",
                (data["name"], data["root_path"], data["active_workflow_version"], data["updated_at"], data["id"]),
            )
            if cursor.rowcount != 1:
                raise KeyError(project.id)

    def get(self, project_id: str) -> Project | None:
        row = self.database.connection.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return Project.model_validate(dict(row)) if row else None

    def list(self) -> list[Project]:
        rows = self.database.connection.execute("SELECT * FROM projects ORDER BY created_at,id").fetchall()
        return [Project.model_validate(dict(row)) for row in rows]


class WorkflowRepository:
    def __init__(self, database: Database):
        self.database = database

    def save(self, workflow: Workflow) -> None:
        data = _dump(workflow)
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO workflows(id,project_id,version,goal,planner_provider,planner_model,status,graph_json,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (
                    data["id"], data["project_id"], data["version"], data["goal"], data["planner_provider"],
                    data["planner_model"], data["status"], _json(data["graph_json"]), data["created_at"],
                ),
            )
            for task in workflow.tasks:
                task_data = _dump(task)
                connection.execute(
                    """INSERT INTO tasks(id,workflow_id,title,description,prompt,agent_type,dependencies_json,
                    execution_policy_json,retry_policy_json,expected_outputs_json,ui_position_json)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                    (
                        task_data["id"], task_data["workflow_id"], task_data["title"], task_data["description"],
                        task_data["prompt"], task_data["agent_type"], _json(task_data["dependencies"]),
                        _json(task_data["execution_policy"]), _json(task_data["retry_policy"]),
                        _json(task_data["expected_outputs"]), _json(task_data["ui_position"]),
                    ),
                )
            connection.execute(
                "UPDATE projects SET active_workflow_version=?,updated_at=? WHERE id=?",
                (workflow.version, datetime.now(timezone.utc).isoformat(), workflow.project_id),
            )

    def get(self, workflow_id: str) -> Workflow | None:
        row = self.database.connection.execute("SELECT * FROM workflows WHERE id=?", (workflow_id,)).fetchone()
        return self._restore(row) if row else None

    def list_versions(self, project_id: str) -> list[Workflow]:
        rows = self.database.connection.execute(
            "SELECT * FROM workflows WHERE project_id=? ORDER BY version", (project_id,)
        ).fetchall()
        return [self._restore(row) for row in rows]

    def _restore(self, row) -> Workflow:
        task_rows = self.database.connection.execute(
            "SELECT * FROM tasks WHERE workflow_id=? ORDER BY rowid", (row["id"],)
        ).fetchall()
        tasks = [
            Task.model_validate(
                {
                    "id": task["id"], "workflow_id": task["workflow_id"], "title": task["title"],
                    "description": task["description"], "prompt": task["prompt"], "agent_type": task["agent_type"],
                    "dependencies": json.loads(task["dependencies_json"]),
                    "execution_policy": json.loads(task["execution_policy_json"]),
                    "retry_policy": json.loads(task["retry_policy_json"]),
                    "expected_outputs": json.loads(task["expected_outputs_json"]),
                    "ui_position": json.loads(task["ui_position_json"]),
                }
            )
            for task in task_rows
        ]
        return Workflow.model_validate(
            {
                "id": row["id"], "project_id": row["project_id"], "version": row["version"], "goal": row["goal"],
                "planner_provider": row["planner_provider"], "planner_model": row["planner_model"], "status": row["status"],
                "graph_json": json.loads(row["graph_json"]), "created_at": row["created_at"], "tasks": tasks,
            }
        )


@dataclass(frozen=True)
class RecoverableRun:
    run: Run
    latest_attempts: dict[str, TaskAttempt]


class RunRepository:
    TERMINAL_STATUSES = (RunStatus.CANCELLED.value, RunStatus.SUCCESS.value, RunStatus.FAILED.value)

    def __init__(self, database: Database):
        self.database = database

    def create(self, run: Run) -> None:
        data = _dump(run)
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO runs(id,workflow_id,status,started_at,completed_at,created_at) VALUES (?,?,?,?,?,?)",
                (data["id"], data["workflow_id"], data["status"], data["started_at"], data["completed_at"], data["created_at"]),
            )

    def update(self, run: Run) -> None:
        data = _dump(run)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                "UPDATE runs SET status=?,started_at=?,completed_at=? WHERE id=?",
                (data["status"], data["started_at"], data["completed_at"], data["id"]),
            )
            if cursor.rowcount != 1:
                raise KeyError(run.id)

    def save_attempt(self, attempt: TaskAttempt) -> None:
        data = _dump(attempt)
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO task_attempts(id,run_id,task_id,node_id,attempt,status,started_at,completed_at,error_json,result_manifest_json)
                VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (
                    data["id"], data["run_id"], data["task_id"], data["node_id"], data["attempt"], data["status"],
                    data["started_at"], data["completed_at"], _json(data["error"]) if data["error"] is not None else None,
                    _json(data["result_manifest"]) if data["result_manifest"] is not None else None,
                ),
            )

    def list_recoverable(self) -> list[RecoverableRun]:
        placeholders = ",".join("?" for _ in self.TERMINAL_STATUSES)
        rows = self.database.connection.execute(
            f"SELECT * FROM runs WHERE status NOT IN ({placeholders}) ORDER BY created_at,id", self.TERMINAL_STATUSES
        ).fetchall()
        return [RecoverableRun(self._run(row), self._latest_attempts(row["id"])) for row in rows]

    def _run(self, row) -> Run:
        return Run.model_validate(dict(row))

    def _latest_attempts(self, run_id: str) -> dict[str, TaskAttempt]:
        rows = self.database.connection.execute(
            """SELECT a.* FROM task_attempts a
            JOIN (SELECT task_id,MAX(attempt) AS attempt FROM task_attempts WHERE run_id=? GROUP BY task_id) latest
            ON a.task_id=latest.task_id AND a.attempt=latest.attempt WHERE a.run_id=?""",
            (run_id, run_id),
        ).fetchall()
        attempts = {}
        for row in rows:
            data = dict(row)
            error_json = data.pop("error_json")
            result_manifest_json = data.pop("result_manifest_json")
            data["error"] = json.loads(error_json) if error_json else None
            data["result_manifest"] = json.loads(result_manifest_json) if result_manifest_json else None
            attempt = TaskAttempt.model_validate(data)
            attempts[attempt.task_id] = attempt
        return attempts


class NodeRepository:
    def __init__(self, database: Database):
        self.database = database

    def upsert(self, node: HermesNode) -> None:
        data = _dump(node)
        values = (
            data["id"], data["name"], data["kind"], data["api_url"], data["ssh_host"], data["ssh_port"], data["ssh_user"],
            data["ssh_key_path"], data["status"], _json(data["capabilities_json"]), data["max_concurrency"],
            data["running_tasks"], data["success_rate"], data["last_seen_at"],
        )
        with self.database.transaction() as connection:
            connection.execute(
                """INSERT INTO nodes VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,kind=excluded.kind,api_url=excluded.api_url,ssh_host=excluded.ssh_host,ssh_port=excluded.ssh_port,
                ssh_user=excluded.ssh_user,ssh_key_path=excluded.ssh_key_path,status=excluded.status,
                capabilities_json=excluded.capabilities_json,max_concurrency=excluded.max_concurrency,
                running_tasks=excluded.running_tasks,success_rate=excluded.success_rate,last_seen_at=excluded.last_seen_at""",
                values,
            )


class ArtifactRepository:
    def __init__(self, database: Database):
        self.database = database

    def save(self, artifact: Artifact) -> None:
        data = _dump(artifact)
        with self.database.transaction() as connection:
            connection.execute(
                "INSERT INTO artifacts(id,run_id,task_id,attempt_id,relative_path,media_type,size,sha256,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
                tuple(data[key] for key in ("id", "run_id", "task_id", "attempt_id", "relative_path", "media_type", "size", "sha256", "created_at")),
            )


@dataclass(frozen=True)
class StoredEvent:
    event_id: int
    run_id: str
    event_type: str
    payload: dict[str, Any]
    created_at: datetime


class EventRepository:
    def __init__(self, database: Database):
        self.database = database

    def append(self, run_id: str, event_type: str, payload: dict[str, Any]) -> StoredEvent:
        created_at = datetime.now(timezone.utc)
        with self.database.transaction() as connection:
            cursor = connection.execute(
                "INSERT INTO events(run_id,event_type,payload_json,created_at) VALUES (?,?,?,?)",
                (run_id, event_type, _json(payload), created_at.isoformat()),
            )
        event_id = cursor.lastrowid
        if event_id is None:
            raise RuntimeError("SQLite did not return an event id")
        return StoredEvent(event_id, run_id, event_type, payload, created_at)

    def list_for_run(self, run_id: str, after_event_id: int = 0, limit: int = 100) -> list[StoredEvent]:
        if limit < 1:
            raise ValueError("limit must be positive")
        rows = self.database.connection.execute(
            "SELECT * FROM events WHERE run_id=? AND event_id>? ORDER BY event_id LIMIT ?",
            (run_id, after_event_id, limit),
        ).fetchall()
        return [
            StoredEvent(row["event_id"], row["run_id"], row["event_type"], json.loads(row["payload_json"]), datetime.fromisoformat(row["created_at"]))
            for row in rows
        ]
