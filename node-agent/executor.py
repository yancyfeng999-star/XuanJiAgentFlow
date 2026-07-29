from __future__ import annotations

import hashlib
import json
import os
import stat
import threading
import uuid
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Iterator

import httpx


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
    hermes_run_id: str | None = None
    error: str | None = None


class HermesNodeClient:
    """Client for Hermes API Server's /v1/runs interface."""

    def __init__(self, base_url: str, token: str, timeout: float = 300) -> None:
        self.base_url = base_url.rstrip("/")
        self.token = token
        self.timeout = timeout

    def _headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}", "Content-Type": "application/json"}

    def health(self) -> dict[str, Any]:
        resp = httpx.get(f"{self.base_url}/v1/capabilities", headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def create_run(self, prompt: str, task_id: str | None = None) -> dict[str, Any]:
        payload = {"prompt": prompt}
        if task_id:
            payload["idempotency_key"] = task_id
        resp = httpx.post(f"{self.base_url}/v1/runs", json=payload, headers=self._headers(), timeout=30)
        resp.raise_for_status()
        return resp.json()

    def get_run(self, run_id: str) -> dict[str, Any]:
        resp = httpx.get(f"{self.base_url}/v1/runs/{run_id}", headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()

    def stop_run(self, run_id: str) -> dict[str, Any]:
        resp = httpx.post(f"{self.base_url}/v1/runs/{run_id}/stop", headers=self._headers(), timeout=10)
        resp.raise_for_status()
        return resp.json()


class NodeExecutor:
    """Runs tasks via Hermes API Server and persists recoverable state."""

    def __init__(self, root: Path, client: HermesNodeClient) -> None:
        self.root = root.resolve()
        self.root.mkdir(parents=True, exist_ok=True)
        self.client = client
        self._create_lock = threading.Lock()

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

    def create_and_start(self, goal: str, task_id: str | None = None) -> TaskRecord:
        with self._create_lock:
            record = self.create(goal, task_id)
            if record.goal != goal:
                raise FileExistsError(record.id)
            return self.start(record.id)

    def create(self, goal: str, task_id: str | None = None) -> TaskRecord:
        task_id = task_id or f"task_{uuid.uuid4().hex[:12]}"
        task_dir = self._task_dir(task_id)
        try:
            task_dir.mkdir()
        except FileExistsError:
            return self._load(task_id)
        (task_dir / "artifacts").mkdir()
        (task_dir / "instruction.md").write_text(goal, encoding="utf-8")
        now = now_iso()
        record = TaskRecord(task_id, goal, "queued", str(task_dir), now, now)
        self._save(record)
        return record

    def start(self, task_id: str) -> TaskRecord:
        record = self._load(task_id)
        if record.hermes_run_id or record.status != "queued":
            return record
        try:
            result = self.client.create_run(record.goal, task_id)
            hermes_run_id = result.get("id") or result.get("run_id")
            record.hermes_run_id = hermes_run_id
            record.status = "running"
            record.updated_at = now_iso()
            self._save(record)
        except Exception as exc:
            record.status = "failed"
            record.error = str(exc)
            record.updated_at = now_iso()
            self._save(record)
        return record

    def poll(self, task_id: str) -> TaskRecord:
        record = self._load(task_id)
        if record.status not in {"running", "cancelling"} or not record.hermes_run_id:
            return record
        cancelling = record.status == "cancelling"
        try:
            hermes_state = self.client.get_run(record.hermes_run_id)
            hermes_status = hermes_state.get("status", "unknown")
            if cancelling and hermes_status in {"stopped", "cancelled"}:
                record.status = "cancelled"
                record.error = None
                record.updated_at = now_iso()
                self._save(record)
            elif hermes_status in {"completed", "success"}:
                record.status = "success"
                record.error = None
                record.updated_at = now_iso()
                self._save(record)
                self._capture_output(task_id, hermes_state)
            elif hermes_status in {"failed", "error"}:
                record.status = "failed"
                record.error = hermes_state.get("error", "Hermes run failed")
                record.updated_at = now_iso()
                self._save(record)
        except Exception as exc:
            record.status = "cancel_failed" if cancelling else "failed"
            record.error = f"{'Cancel reconciliation' if cancelling else 'Poll'} error: {exc}"
            record.updated_at = now_iso()
            self._save(record)
        return record

    def cancel(self, task_id: str) -> TaskRecord:
        record = self._load(task_id)
        if not record.hermes_run_id:
            return record
        try:
            result = self.client.stop_run(record.hermes_run_id)
            hermes_status = result.get("status", "unknown")
            if hermes_status in {"stopped", "cancelled"}:
                record.status = "cancelled"
                record.error = None
            else:
                record.status = "cancelling"
                record.error = f"Hermes stop not confirmed: {hermes_status}"
        except Exception as exc:
            record.status = "cancel_failed"
            record.error = f"Cancel error: {exc}"
        record.updated_at = now_iso()
        self._save(record)
        return record

    def get(self, task_id: str) -> TaskRecord:
        return self._load(task_id)

    def capabilities(self) -> dict:
        try:
            caps = self.client.health()
            return {"hermes_available": True, "hermes_capabilities": caps}
        except Exception as exc:
            return {"hermes_available": False, "error": str(exc)}

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
        task_dir = self._task_dir(task_id)
        if not task_dir.exists():
            raise FileNotFoundError(task_id)
        path = task_dir / "artifacts.json"
        if not path.exists():
            return []
        return json.loads(path.read_text(encoding="utf-8"))

    def artifact(self, task_id: str, artifact_path: str) -> tuple[BinaryIO, int, str]:
        task_dir = self._task_dir(task_id)
        if not task_dir.exists():
            raise FileNotFoundError(task_id)
        relative = PurePosixPath(artifact_path)
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise ValueError("unsafe artifact path")
        artifacts_dir = (task_dir / "artifacts").resolve()
        path = artifacts_dir / Path(*relative.parts)
        flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
        try:
            descriptor = os.open(path, flags)
        except OSError:
            raise FileNotFoundError(artifact_path) from None
        artifact = os.fdopen(descriptor, "rb")
        try:
            opened = os.fstat(descriptor)
            if not stat.S_ISREG(opened.st_mode):
                raise FileNotFoundError(artifact_path)
            resolved = path.resolve(strict=True)
            if artifacts_dir not in resolved.parents:
                raise FileNotFoundError(artifact_path)
            current = resolved.stat()
            if (opened.st_dev, opened.st_ino) != (current.st_dev, current.st_ino):
                raise FileNotFoundError(artifact_path)
            digest = hashlib.sha256()
            while chunk := artifact.read(64 * 1024):
                digest.update(chunk)
            artifact.seek(0)
            return artifact, opened.st_size, digest.hexdigest()
        except BaseException:
            artifact.close()
            raise

    @staticmethod
    def stream_artifact(artifact: BinaryIO, chunk_size: int = 64 * 1024) -> Iterator[bytes]:
        try:
            while chunk := artifact.read(chunk_size):
                yield chunk
        finally:
            artifact.close()

    @staticmethod
    def _sha256(path: Path, chunk_size: int = 64 * 1024) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as artifact:
            while chunk := artifact.read(chunk_size):
                digest.update(chunk)
        return digest.hexdigest()

    def _capture_output(self, task_id: str, hermes_state: dict) -> None:
        task_dir = self._task_dir(task_id)
        artifacts_dir = task_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        output = hermes_state.get("output", "")
        if output:
            (artifacts_dir / "hermes-output.md").write_text(output, encoding="utf-8")
        self._write_artifact_manifest(task_id)

    def _write_artifact_manifest(self, task_id: str) -> None:
        task_dir = self._task_dir(task_id)
        artifacts_dir = task_dir / "artifacts"
        manifest = []
        for path in sorted(p for p in artifacts_dir.rglob("*") if p.is_file() and not p.is_symlink()):
            manifest.append({
                "path": path.relative_to(artifacts_dir).as_posix(),
                "size": path.stat().st_size,
                "sha256": self._sha256(path),
            })
        (task_dir / "artifacts.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
