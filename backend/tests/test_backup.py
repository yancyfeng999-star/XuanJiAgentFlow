from __future__ import annotations

from pathlib import Path

import pytest

from xuanji.domain.models import Project, Task, Workflow
from xuanji.storage.backup import BackupError, backup_database, restore_database, verify_backup
from xuanji.storage.database import Database
from xuanji.storage.repositories import ProjectRepository, RunRepository, WorkflowRepository
from xuanji.domain.models import Run


def _seed(db_path: Path) -> None:
    database = Database(db_path)
    database.migrate()
    ProjectRepository(database).create(Project(id="p1", name="Demo", root_path=str(db_path.parent / "proj")))
    WorkflowRepository(database).save(Workflow(
        id="w1", project_id="p1", version=1, goal="g",
        tasks=[Task(id="t1", workflow_id="w1", title="T")],
    ))
    runs = RunRepository(database)
    runs.create(Run(id="r1", workflow_id="w1"))
    database.close()


def test_online_backup_and_restore_roundtrip(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "coordinator.db"
    _seed(db_path)
    backup_path = tmp_path / "backups" / "coordinator.bak"
    report = backup_database(db_path, backup_path)
    assert report["size"] > 0

    info = verify_backup(backup_path)
    assert info["integrity"] == "ok"
    assert info["schema_version"] >= 5

    restored_path = tmp_path / "restore" / "coordinator.db"
    restore_database(backup_path, restored_path)
    restored = Database(restored_path)
    restored.migrate()
    assert ProjectRepository(restored).get("p1") is not None
    workflow = WorkflowRepository(restored).get("w1")
    assert workflow is not None and [task.id for task in workflow.tasks] == ["t1"]
    assert RunRepository(restored).get("r1") is not None
    restored.close()


def test_backup_runs_while_source_has_open_connection(tmp_path: Path) -> None:
    db_path = tmp_path / "data" / "coordinator.db"
    _seed(db_path)
    database = Database(db_path)  # 活跃连接不关闭
    report = backup_database(db_path, tmp_path / "b.bak")
    assert report["size"] > 0
    database.close()


def test_corrupted_backup_is_rejected(tmp_path: Path) -> None:
    bad = tmp_path / "bad.bak"
    bad.write_bytes(b"not a sqlite database" * 64)
    with pytest.raises(BackupError) as error:
        verify_backup(bad)
    assert error.value.code == "backup_corrupted"
    with pytest.raises(BackupError):
        restore_database(bad, tmp_path / "out.db")


def test_missing_backup_is_rejected(tmp_path: Path) -> None:
    with pytest.raises(BackupError) as error:
        verify_backup(tmp_path / "missing.bak")
    assert error.value.code == "backup_missing"
