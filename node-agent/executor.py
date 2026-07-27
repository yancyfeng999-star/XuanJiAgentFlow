from __future__ import annotations

import asyncio
import hashlib
import json
import os
import shutil
import signal
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import AsyncIterator


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class TaskRecord:
    id: str
    goal: str
    status: str
    workdir: str
    created_at: str
    updated_at: str
    pid: int | None = None
    exit_code: int | None = None
    error: str | None = None


class NodeExecutor:
    """Runs one Hermes CLI process per task and persists recoverable state."""

    def __init__(self, root: Path, hermes_bin: str = "hermes") -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.hermes_bin = hermes_bin
        self._processes: dict[str, asyncio.subprocess.Process] = {}
        self._workers: dict[str, asyncio.Task[None]] = {}

    def _task_dir(self, task_id: str) -> Path:
        path = (self.root / task_id).resolve()
        if self.root not in path.parents:
            raise ValueError("task path escapes node root")
        return path

    def _record_path(self, task_id: str) -> Path:
        return self._task_dir(task_id) / "task.json"

    def _load(self, task_id: str) -> TaskRecord:
        with self._record_path(task_id).open(encoding="utf-8") as fh:
            return TaskRecord(**json.load(fh))

    def _save(self, record: TaskRecord) -> None:
        path = self._record_path(record.id)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_text(json.dumps(asdict(record), ensure_ascii=False, indent=2), encoding="utf-8")
        tmp.replace(path)

    def create(self, goal: str, task_id: str | None = None) -> TaskRecord:
        task_id = task_id or f"task_{uuid.uuid4().hex[:12]}"
        task_dir = self._task_dir(task_id)
        if task_dir.exists():
            return self._load(task_id)
        (task_dir / "artifacts").mkdir(parents=True)
        (task_dir / "instruction.md").write_text(goal, encoding="utf-8")
        now = now_iso()
        record = TaskRecord(task_id, goal, "queued", str(task_dir), now, now)
        self._save(record)
        return record

    async def start(self, task_id: str) -> TaskRecord:
        record = self._load(task_id)
        if record.status in {"running", "success"}:
            return record
        worker = asyncio.create_task(self._run(task_id))
        self._workers[task_id] = worker
        await asyncio.sleep(0)
        return self._load(task_id)

    async def _run(self, task_id: str) -> None:
        record = self._load(task_id)
        task_dir = self._task_dir(task_id)
        log_path = task_dir / "logs.jsonl"
        command = [
            self.hermes_bin,
            "chat",
            "-q",
            record.goal,
            "-Q",
            "--source",
            "tool",
            "--pass-session-id",
        ]
        try:
            process = await asyncio.create_subprocess_exec(
                *command,
                cwd=task_dir,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                start_new_session=True,
            )
            self._processes[task_id] = process
            record.status = "running"
            record.pid = process.pid
            record.updated_at = now_iso()
            self._save(record)

            async def drain(stream: asyncio.StreamReader, level: str) -> None:
                with log_path.open("a", encoding="utf-8") as log:
                    while line := await stream.readline():
                        event = {"time": now_iso(), "level": level, "message": line.decode(errors="replace").rstrip()}
                        log.write(json.dumps(event, ensure_ascii=False) + "\n")
                        log.flush()

            assert process.stdout is not None
            assert process.stderr is not None
            await asyncio.gather(drain(process.stdout, "stdout"), drain(process.stderr, "stderr"))
            code = await process.wait()
            record = self._load(task_id)
            record.exit_code = code
            record.pid = None
            record.status = "success" if code == 0 else "failed"
            record.error = None if code == 0 else f"Hermes exited with code {code}"
            record.updated_at = now_iso()
            self._save(record)
            self._write_artifact_manifest(task_id)
        except FileNotFoundError:
            record.status = "failed"
            record.error = f"Hermes executable not found: {self.hermes_bin}"
            record.updated_at = now_iso()
            self._save(record)
        except asyncio.CancelledError:
            raise
        finally:
            self._processes.pop(task_id, None)
            self._workers.pop(task_id, None)

    async def cancel(self, task_id: str) -> TaskRecord:
        record = self._load(task_id)
        process = self._processes.get(task_id)
        if process and process.returncode is None:
            try:
                os.killpg(process.pid, signal.SIGTERM)
            except ProcessLookupError:
                pass
            try:
                await asyncio.wait_for(process.wait(), timeout=5)
            except asyncio.TimeoutError:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                await process.wait()
        record = self._load(task_id)
        record.status = "cancelled"
        record.pid = None
        record.updated_at = now_iso()
        self._save(record)
        return record

    def get(self, task_id: str) -> TaskRecord:
        return self._load(task_id)

    def capabilities(self) -> dict:
        hermes_path = shutil.which(self.hermes_bin)
        return {
            "hermes_available": hermes_path is not None,
            "hermes_path": hermes_path,
            "max_concurrency": 1,
            "running_tasks": len(self._processes),
            "tools": [],
            "models": [],
        }

    def logs(self, task_id: str, offset: int = 0) -> list[dict]:
        path = self._task_dir(task_id) / "logs.jsonl"
        if not path.exists():
            return []
        events = []
        with path.open(encoding="utf-8") as fh:
            for index, line in enumerate(fh):
                if index >= offset:
                    events.append(json.loads(line))
        return events

    def artifacts(self, task_id: str) -> list[dict]:
        path = self._task_dir(task_id) / "artifacts.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def _write_artifact_manifest(self, task_id: str) -> None:
        task_dir = self._task_dir(task_id)
        artifacts_dir = task_dir / "artifacts"
        manifest = []
        for path in sorted(p for p in artifacts_dir.rglob("*") if p.is_file()):
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            manifest.append({
                "path": str(path.relative_to(task_dir)),
                "size": path.stat().st_size,
                "sha256": digest,
            })
        (task_dir / "artifacts.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
