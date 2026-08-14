from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path


class BackupError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def backup_database(db_path: Path, dest_path: Path) -> dict:
    """Consistent online backup via SQLite's backup API (safe during active WAL writes)."""
    source = Path(db_path)
    if not source.is_file():
        raise BackupError("backup_source_missing", f"数据库不存在：{source}")
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    started = datetime.now(timezone.utc)
    with sqlite3.connect(source) as src, sqlite3.connect(dest) as dst:
        src.backup(dst)
    return {
        "source": str(source),
        "dest": str(dest),
        "size": dest.stat().st_size,
        "created_at": started.isoformat(),
    }


def verify_backup(backup_path: Path) -> dict:
    """Integrity + schema check; rejects corrupted or non-Xuanji backups."""
    path = Path(backup_path)
    if not path.is_file():
        raise BackupError("backup_missing", f"备份文件不存在：{path}")
    try:
        with sqlite3.connect(path) as connection:
            integrity = connection.execute("PRAGMA integrity_check").fetchone()[0]
            if integrity != "ok":
                raise BackupError("backup_corrupted", f"备份完整性校验失败：{integrity}")
            row = connection.execute(
                "SELECT COALESCE(MAX(version), 0) FROM schema_version"
            ).fetchone()
            schema_version = int(row[0])
            if schema_version < 1:
                raise BackupError("backup_invalid", "备份缺少有效的 schema 版本")
    except sqlite3.DatabaseError as error:
        raise BackupError("backup_corrupted", f"备份不是有效的 SQLite 数据库：{error}") from None
    return {"path": str(path), "schema_version": schema_version, "integrity": "ok"}


def restore_database(backup_path: Path, dest_path: Path) -> dict:
    """Verify a backup, then place it at dest (dest must not exist or be overwritable safely)."""
    info = verify_backup(backup_path)
    dest = Path(dest_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    source = Path(backup_path)
    with sqlite3.connect(source) as src, sqlite3.connect(dest) as dst:
        src.backup(dst)
    return {**info, "restored_to": str(dest)}
