from __future__ import annotations

import hashlib
import json
import mimetypes
import os
from datetime import datetime, timezone
from pathlib import Path, PurePath

from xuanji.domain.enums import TaskStatus, ensure_task_transition
from xuanji.domain.models import Project, TaskAttempt, Workflow

from .manifest import ArtifactEntry, ArtifactManifest


class UnsafePathError(ValueError):
    pass


class ArtifactVerificationError(ValueError):
    pass


class ArtifactManager:
    def __init__(self, projects_root: str | Path):
        self.projects_root = Path(projects_root).expanduser().resolve()
        self.projects_root.mkdir(parents=True, exist_ok=True)
        self._project_paths: dict[str, Path] = {}

    def create_project(self, project: Project) -> Path:
        root = Path(project.root_path).expanduser()
        if not root.is_absolute():
            root = self.projects_root / root
        root = root.resolve()
        if root != self.projects_root and self.projects_root not in root.parents:
            raise UnsafePathError("project root must be inside configured projects root")
        root.mkdir(parents=True, exist_ok=True)
        for relative in ("workflow", "runs", "shared", "deliverables"):
            (root / relative).mkdir(exist_ok=True)
        self._project_paths[project.id] = root
        self._atomic_json(root / "project.json", project.model_dump(mode="json"))
        return root

    def resolve_project_path(self, project_id: str, relative_path: str | Path) -> Path:
        root = self._project_root(project_id)
        raw = str(relative_path)
        # Treat both POSIX and Windows separators as separators before validation.
        normalized = raw.replace("\\", "/")
        candidate_parts = PurePath(normalized).parts
        if os.path.isabs(raw) or normalized.startswith("/") or ".." in candidate_parts:
            raise UnsafePathError(f"unsafe project path: {raw}")
        candidate = (root / normalized).resolve()
        if candidate != root and root not in candidate.parents:
            raise UnsafePathError(f"path escapes project root: {raw}")
        return candidate

    def save_workflow(self, project_id: str, workflow: Workflow) -> Path:
        path = self.resolve_project_path(project_id, f"workflow/v{workflow.version:03d}.json")
        self._atomic_json(path, workflow.model_dump(mode="json"))
        return path

    def create_run(self, project_id: str, run_id: str, workflow_id: str) -> Path:
        run_root = self.resolve_project_path(project_id, f"runs/{run_id}")
        (run_root / "tasks").mkdir(parents=True, exist_ok=True)
        self._atomic_json(
            run_root / "manifest.json",
            {
                "id": run_id,
                "workflow_id": workflow_id,
                "status": "pending",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        )
        return run_root

    def create_task(self, project_id: str, run_id: str, task_id: str, instruction: str) -> Path:
        task_root = self.resolve_project_path(project_id, f"runs/{run_id}/tasks/{task_id}")
        (task_root / "artifacts").mkdir(parents=True, exist_ok=True)
        (task_root / "instruction.md").write_text(instruction, encoding="utf-8")
        (task_root / "logs.jsonl").touch(exist_ok=True)
        return task_root

    def build_manifest(
        self, project_id: str, run_id: str, task_id: str, artifact_names: list[str]
    ) -> ArtifactManifest:
        entries: list[ArtifactEntry] = []
        for name in artifact_names:
            normalized = name.replace("\\", "/")
            if PurePath(normalized).is_absolute() or ".." in PurePath(normalized).parts:
                raise UnsafePathError(f"unsafe artifact path: {name}")
            relative = f"runs/{run_id}/tasks/{task_id}/artifacts/{normalized}"
            path = self.resolve_project_path(project_id, relative)
            if not path.is_file():
                raise ArtifactVerificationError(f"artifact is missing: {name}")
            entries.append(self._entry(task_id, relative, path))
        manifest = ArtifactManifest(run_id=run_id, task_id=task_id, artifacts=entries)
        self._atomic_json(
            self.resolve_project_path(project_id, f"runs/{run_id}/tasks/{task_id}/result.json"),
            manifest.model_dump(mode="json"),
        )
        return manifest

    def verify_manifest(self, project_id: str, manifest: ArtifactManifest) -> None:
        for entry in manifest.artifacts:
            path = self.resolve_project_path(project_id, entry.path)
            if not path.is_file():
                raise ArtifactVerificationError(f"artifact is missing: {entry.path}")
            actual_size = path.stat().st_size
            if actual_size != entry.size:
                raise ArtifactVerificationError(
                    f"size mismatch for {entry.path}: expected {entry.size}, got {actual_size}"
                )
            actual_hash = self._sha256(path)
            if actual_hash != entry.sha256:
                raise ArtifactVerificationError(f"hash mismatch for {entry.path}")

    def finalize_success(
        self, project_id: str, attempt: TaskAttempt, manifest: ArtifactManifest
    ) -> None:
        if attempt.run_id != manifest.run_id or attempt.task_id != manifest.task_id:
            raise ArtifactVerificationError("manifest does not belong to task attempt")
        self.verify_manifest(project_id, manifest)
        ensure_task_transition(attempt.status, TaskStatus.SUCCESS)
        attempt.result_manifest = manifest.model_dump(mode="json")
        attempt.status = TaskStatus.SUCCESS
        attempt.completed_at = datetime.now(timezone.utc)

    def _project_root(self, project_id: str) -> Path:
        try:
            return self._project_paths[project_id]
        except KeyError as exc:
            raise KeyError(f"unknown project: {project_id}") from exc

    def _entry(self, task_id: str, relative: str, path: Path) -> ArtifactEntry:
        media_type = mimetypes.guess_type(path.name)[0]
        if media_type is None and path.suffix.lower() in {".md", ".markdown"}:
            media_type = "text/markdown"
        media_type = media_type or "application/octet-stream"
        return ArtifactEntry(
            task_id=task_id,
            path=relative,
            media_type=media_type,
            size=path.stat().st_size,
            sha256=self._sha256(path),
        )

    @staticmethod
    def _sha256(path: Path) -> str:
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        return digest.hexdigest()

    @staticmethod
    def _atomic_json(path: Path, value: object) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(path.suffix + ".tmp")
        temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
        temporary.replace(path)
