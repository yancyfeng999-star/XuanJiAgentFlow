from __future__ import annotations

import hashlib
import json
import os
import shutil
import stat
import subprocess
import threading
import uuid
from dataclasses import dataclass, asdict, field
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from typing import Any, BinaryIO, Iterator

import httpx


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def visible_error(error: object, fallback: str) -> str:
    text = str(error).strip()
    if text and any("\u4e00" <= character <= "\u9fff" for character in text):
        return text
    return fallback


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
    project_id: str = "legacy"
    run_id: str = "legacy"
    source_task_id: str = "legacy"
    inputs: list[dict[str, Any]] = field(default_factory=list)
    output_policy: dict[str, Any] = field(
        default_factory=lambda: {"mode": "discover", "expected": []}
    )
    verify: list[dict[str, str]] = field(default_factory=list)
    done_definition: list[str] = field(default_factory=list)
    verify_results: list[dict[str, str]] = field(default_factory=list)
    dispatch_sha256: str = ""


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


class HermesCliClient:
    """Runs the installed Hermes CLI when the legacy /v1/runs API is unavailable."""

    def __init__(self, tasks_root: Path) -> None:
        self.tasks_root = tasks_root.resolve()
        self._processes: dict[str, subprocess.Popen[str]] = {}
        self._lock = threading.Lock()

    def _run_dir(self, run_id: str) -> Path:
        path = (self.tasks_root / run_id).resolve()
        if self.tasks_root not in path.parents:
            raise ValueError("Hermes CLI 运行路径超出节点工作目录")
        return path

    def health(self) -> dict[str, Any]:
        executable = shutil.which("hermes")
        if not executable:
            raise RuntimeError("Hermes CLI 未安装")
        result = subprocess.run(
            [executable, "--version"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if result.returncode != 0:
            raise RuntimeError("Hermes CLI 健康检查失败")
        return {
            "runtime": "cli",
            "version": (result.stdout or result.stderr).strip().splitlines()[0],
            "models": [],
            "tools": ["terminal"],
            "tags": ["hermes-cli"],
        }

    def create_run(self, prompt: str, task_id: str | None = None) -> dict[str, Any]:
        run_id = task_id or f"run_{uuid.uuid4().hex[:12]}"
        run_dir = self._run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)
        stdout_path = run_dir / ".hermes-stdout"
        stderr_path = run_dir / ".hermes-stderr"
        executable = shutil.which("hermes")
        if not executable:
            raise RuntimeError("Hermes CLI 未安装")
        with self._lock:
            existing = self._processes.get(run_id)
            if existing is not None and existing.poll() is None:
                return {"id": run_id, "status": "running"}
            stdout = stdout_path.open("w", encoding="utf-8")
            stderr = stderr_path.open("w", encoding="utf-8")
            try:
                process = subprocess.Popen(
                    [executable, "--oneshot", prompt],
                    cwd=run_dir,
                    stdout=stdout,
                    stderr=stderr,
                    text=True,
                    start_new_session=True,
                )
            finally:
                stdout.close()
                stderr.close()
            self._processes[run_id] = process
        return {"id": run_id, "status": "running"}

    def get_run(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            process = self._processes.get(run_id)
        if process is None:
            raise RuntimeError("Hermes CLI 运行记录不存在")
        return_code = process.poll()
        if return_code is None:
            return {"id": run_id, "status": "running"}
        run_dir = self._run_dir(run_id)
        stdout = (run_dir / ".hermes-stdout").read_text(encoding="utf-8", errors="replace")
        stderr = (run_dir / ".hermes-stderr").read_text(encoding="utf-8", errors="replace")
        if return_code == 0:
            return {"id": run_id, "status": "success", "output": stdout.strip()}
        return {
            "id": run_id,
            "status": "failed",
            "error": visible_error(stderr, "Hermes CLI 任务执行失败"),
        }

    def stop_run(self, run_id: str) -> dict[str, Any]:
        with self._lock:
            process = self._processes.get(run_id)
        if process is None or process.poll() is not None:
            return {"id": run_id, "status": "cancelled"}
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        return {"id": run_id, "status": "cancelled"}


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
            raise ValueError("任务路径超出节点工作目录")
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

    @staticmethod
    def _dispatch_sha256(dispatch: dict[str, Any]) -> str:
        canonical = json.dumps(dispatch, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def create(self, dispatch: dict[str, Any]) -> TaskRecord:
        task_id = dispatch.get("idempotency_key") or f"task_{uuid.uuid4().hex[:12]}"
        signature = self._dispatch_sha256(dispatch)
        task_dir = self._task_dir(task_id)
        with self._create_lock:
            try:
                task_dir.mkdir()
            except FileExistsError:
                record = self._load(task_id)
                if record.dispatch_sha256 and record.dispatch_sha256 != signature:
                    raise FileExistsError(record.id)
                if not record.dispatch_sha256 and record.goal != dispatch["instruction"]:
                    raise FileExistsError(record.id)
                return record
            (task_dir / "artifacts").mkdir()
            (task_dir / "inputs").mkdir()
            (task_dir / "instruction.md").write_text(dispatch["instruction"], encoding="utf-8")
            (task_dir / "logs.jsonl").touch()
            now = now_iso()
            record = TaskRecord(
                task_id,
                dispatch["instruction"],
                "queued",
                str(task_dir),
                now,
                now,
                project_id=dispatch["project_id"],
                run_id=dispatch["run_id"],
                source_task_id=dispatch["task_id"],
                inputs=dispatch.get("inputs", []),
                output_policy=dispatch.get("output_policy", {"mode": "discover", "expected": []}),
                verify=list(dispatch.get("verify", [])),
                done_definition=list(dispatch.get("done_definition", [])),
                dispatch_sha256=signature,
            )
            self._save(record)
            self._append_log(task_id, "task_created", input_count=len(record.inputs))
            return record

    @staticmethod
    def _safe_relative(path: str) -> PurePosixPath:
        relative = PurePosixPath(path.replace("\\", "/"))
        if relative.is_absolute() or not relative.parts or ".." in relative.parts:
            raise ValueError("相对路径不安全")
        return relative

    def upload_input(
        self,
        task_id: str,
        input_path: str,
        body: bytes,
        *,
        size: int,
        sha256: str,
    ) -> dict[str, Any]:
        record = self._load(task_id)
        if record.status != "queued" or record.hermes_run_id:
            raise RuntimeError("任务已经开始执行")
        relative = self._safe_relative(input_path)
        declared = next((item for item in record.inputs if item["path"] == relative.as_posix()), None)
        if declared is None:
            raise KeyError(input_path)
        actual_sha256 = hashlib.sha256(body).hexdigest()
        if len(body) != size or size != declared["size"]:
            raise ValueError("输入文件大小不匹配")
        if actual_sha256 != sha256 or sha256 != declared["sha256"]:
            raise ValueError("输入文件哈希不匹配")
        inputs_root = (self._task_dir(task_id) / "inputs").resolve()
        target = inputs_root / Path(*relative.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = target.with_suffix(target.suffix + ".tmp")
        temporary.write_bytes(body)
        temporary.replace(target)
        target.chmod(0o444)
        self._append_log(task_id, "input_uploaded", path=relative.as_posix(), size=size)
        return {"path": relative.as_posix(), "size": size, "sha256": sha256}

    def _verified_inputs(self, record: TaskRecord) -> list[tuple[dict[str, Any], Path]]:
        root = (self._task_dir(record.id) / "inputs").resolve()
        verified: list[tuple[dict[str, Any], Path]] = []
        for item in record.inputs:
            relative = self._safe_relative(item["path"])
            path = (root / Path(*relative.parts)).resolve()
            if root not in path.parents or not path.is_file() or path.is_symlink():
                raise ValueError(f"输入文件缺失：{relative.as_posix()}")
            if path.stat().st_size != item["size"] or self._sha256(path) != item["sha256"]:
                raise ValueError(f"输入文件校验失败：{relative.as_posix()}")
            verified.append((item, path))
        return verified

    def _execution_prompt(self, record: TaskRecord, inputs: list[tuple[dict[str, Any], Path]]) -> str:
        if record.project_id == "legacy" and not inputs:
            return record.goal
        sections = [record.goal]
        if inputs:
            sections.append(
                "\nThe following verified upstream artifacts are task inputs. "
                "Use their contents as authoritative context:"
            )
        for item, path in inputs:
            header = (
                f"\n--- INPUT {item['path']} "
                f"(source task {item['source_task_id']}, sha256 {item['sha256']}) ---"
            )
            try:
                content = path.read_text(encoding="utf-8")
            except UnicodeDecodeError:
                content = "[binary input; inspect the staged file by its path]"
            sections.extend([header, content, "--- END INPUT ---"])
        expected = record.output_policy.get("expected", [])
        if expected:
            sections.append(f"\nReturn the final result for the declared output: {expected[0]}")
        else:
            sections.append("\nReturn the final result as Markdown.")
        return "\n".join(sections)

    def start(self, task_id: str) -> TaskRecord:
        with self._create_lock:
            record = self._load(task_id)
            if record.hermes_run_id or record.status != "queued":
                return record
            try:
                inputs = self._verified_inputs(record)
                result = self.client.create_run(self._execution_prompt(record, inputs), task_id)
                hermes_run_id = result.get("id") or result.get("run_id")
                if not hermes_run_id:
                    raise ValueError("Hermes 未返回运行 ID")
                record.hermes_run_id = hermes_run_id
                record.status = "running"
                record.updated_at = now_iso()
                self._save(record)
                self._append_log(task_id, "hermes_started", hermes_run_id=hermes_run_id)
            except Exception as exc:
                record.status = "failed"
                record.error = visible_error(exc, "Hermes 任务启动失败")
                record.updated_at = now_iso()
                self._save(record)
                self._append_log(task_id, "task_failed", error=record.error)
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
                self._capture_output(task_id, hermes_state)
                record.verify_results = self._run_verification(record)
                failed = [item for item in record.verify_results if item["status"] == "fail"]
                manual = [item for item in record.verify_results if item["status"] == "manual"]
                if failed:
                    record.status = "failed"
                    record.error = "验证步骤未通过：" + "；".join(item["value"] for item in failed)
                elif manual:
                    record.status = "needs_review"
                    record.error = None
                else:
                    record.status = "success"
                    record.error = None
                record.updated_at = now_iso()
                self._save(record)
                self._append_log(
                    task_id,
                    "task_succeeded" if record.status == "success" else "task_verify_hold",
                    status=record.status,
                )
            elif hermes_status in {"failed", "error"}:
                record.status = "failed"
                record.error = visible_error(
                    hermes_state.get("error") or "",
                    "Hermes 任务执行失败",
                )
                record.updated_at = now_iso()
                self._save(record)
                self._append_log(task_id, "task_failed", error=str(record.error))
        except Exception as exc:
            record.status = "cancel_failed" if cancelling else "failed"
            record.error = "取消状态同步失败" if cancelling else "任务状态查询失败"
            record.updated_at = now_iso()
            self._save(record)
            self._append_log(task_id, "poll_failed", error=str(record.error))
        return record

    def _run_verification(self, record: TaskRecord) -> list[dict[str, str]]:
        results: list[dict[str, str]] = []
        workdir = Path(record.workdir)
        for step in record.verify:
            kind = step.get("kind", "")
            value = step.get("value", "")
            outcome = {"kind": kind, "value": value, "status": "fail", "detail": ""}
            try:
                if kind == "manual":
                    outcome["status"] = "manual"
                    outcome["detail"] = "需要人工确认"
                elif kind == "file_exists":
                    target = (workdir / self._safe_relative(value)).resolve()
                    outcome["status"] = "pass" if target.is_file() and workdir in target.parents else "fail"
                elif kind == "sha256":
                    path, _, expected = value.partition("#")
                    target = (workdir / self._safe_relative(path)).resolve()
                    if not target.is_file() or workdir not in target.parents:
                        outcome["status"] = "fail"
                        outcome["detail"] = "文件不存在"
                    else:
                        digest = hashlib.sha256(target.read_bytes()).hexdigest()
                        outcome["status"] = "pass" if digest == expected.lower() else "fail"
                elif kind == "command":
                    completed = subprocess.run(
                        value,
                        shell=True,
                        cwd=workdir,
                        capture_output=True,
                        text=True,
                        timeout=120,
                    )
                    outcome["status"] = "pass" if completed.returncode == 0 else "fail"
                    outcome["detail"] = (completed.stderr or completed.stdout or "")[-500:]
                else:
                    outcome["detail"] = f"未知验证类型：{kind}"
            except Exception as exc:
                outcome["status"] = "fail"
                outcome["detail"] = str(exc)[:500]
            results.append(outcome)
        return results

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
                record.error = f"Hermes 尚未确认停止任务，当前状态：{hermes_status}"
        except Exception as exc:
            record.status = "cancel_failed"
            record.error = "取消 Hermes 任务失败"
        record.updated_at = now_iso()
        self._save(record)
        self._append_log(task_id, "cancel_reconciled", status=record.status)
        return record

    def get(self, task_id: str) -> TaskRecord:
        return self._load(task_id)

    def capabilities(self) -> dict:
        try:
            caps = self.client.health()
            return {"hermes_available": True, **caps}
        except Exception as exc:
            return {
                "hermes_available": False,
                "error": visible_error(exc, "Hermes 健康检查失败"),
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

    def _append_log(self, task_id: str, event: str, **payload: Any) -> None:
        path = self._task_dir(task_id) / "logs.jsonl"
        entry = {"timestamp": now_iso(), "event": event, **payload}
        with path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(entry, ensure_ascii=False) + "\n")

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
            raise ValueError("产物路径不安全")
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
        record = self._load(task_id)
        task_dir = self._task_dir(task_id)
        artifacts_dir = task_dir / "artifacts"
        artifacts_dir.mkdir(parents=True, exist_ok=True)
        output = hermes_state.get("output", "")
        if output:
            expected = record.output_policy.get("expected", [])
            output_path = (
                "hermes-output.md"
                if record.project_id == "legacy"
                else expected[0] if len(expected) == 1 else "result.md"
            )
            relative = self._safe_relative(output_path)
            target = artifacts_dir / Path(*relative.parts)
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_text(output, encoding="utf-8")
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
