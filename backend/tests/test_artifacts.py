import hashlib
import json
from pathlib import Path

import pytest

from xuanji.artifacts.manager import ArtifactManager, ArtifactVerificationError, UnsafePathError
from xuanji.artifacts.manifest import ArtifactManifest
from xuanji.domain.enums import TaskStatus
from xuanji.domain.models import Project, TaskAttempt, Workflow


def test_create_project_allows_absolute_root_outside_projects_root(tmp_path):
    managed = tmp_path / "managed"
    external = tmp_path / "user" / "picked"
    manager = ArtifactManager(managed)
    project = Project(id="project_external", name="External", root_path=str(external))

    root = manager.create_project(project)

    assert root == external.resolve()
    assert (root / "workflow").is_dir()
    assert (root / "project.json").is_file()


def test_create_project_workflow_run_and_task_layout(tmp_path):
    manager = ArtifactManager(tmp_path)
    project = Project(id="project_1", name="Demo", root_path=str(tmp_path / "project_1"))
    workflow = Workflow(id="workflow_1", project_id=project.id, version=1, goal="Demo")

    project_root = manager.create_project(project)
    workflow_file = manager.save_workflow(project.id, workflow)
    run_root = manager.create_run(project.id, "run_1", workflow.id)
    task_root = manager.create_task(project.id, "run_1", "task_1", "Do the work")

    assert json.loads((project_root / "project.json").read_text())["id"] == "project_1"
    assert workflow_file == project_root / "workflow" / "v001.json"
    assert json.loads((run_root / "manifest.json").read_text())["workflow_id"] == "workflow_1"
    assert (task_root / "instruction.md").read_text() == "Do the work"
    assert (task_root / "artifacts").is_dir()
    assert (project_root / "shared").is_dir()
    assert (project_root / "deliverables").is_dir()


@pytest.mark.parametrize(
    "unsafe",
    ["../escape.txt", "/tmp/escape.txt", "runs/run_1/tasks/../../escape.txt", "runs\\..\\escape.txt"],
)
def test_resolve_rejects_path_traversal_and_absolute_paths(tmp_path, unsafe):
    manager = ArtifactManager(tmp_path)
    manager.create_project(Project(id="p1", name="Demo", root_path=str(tmp_path / "p1")))
    with pytest.raises(UnsafePathError):
        manager.resolve_project_path("p1", unsafe)


def test_manifest_records_sha256_size_and_media_type(tmp_path):
    manager = ArtifactManager(tmp_path)
    manager.create_project(Project(id="p1", name="Demo", root_path=str(tmp_path / "p1")))
    manager.create_run("p1", "r1", "w1")
    manager.create_task("p1", "r1", "t1", "Write report")
    output = manager.resolve_project_path("p1", "runs/r1/tasks/t1/artifacts/report.md")
    output.write_bytes("报告内容".encode())

    manifest = manager.build_manifest("p1", "r1", "t1", ["report.md"])

    assert manifest.artifacts[0].size == len("报告内容".encode())
    assert manifest.artifacts[0].sha256 == hashlib.sha256("报告内容".encode()).hexdigest()
    assert manifest.artifacts[0].media_type == "text/markdown"
    assert ArtifactManifest.model_validate_json(
        manager.resolve_project_path("p1", "runs/r1/tasks/t1/result.json").read_text()
    ) == manifest


def test_finalize_success_only_after_all_files_verify(tmp_path):
    manager = ArtifactManager(tmp_path)
    manager.create_project(Project(id="p1", name="Demo", root_path=str(tmp_path / "p1")))
    manager.create_run("p1", "r1", "w1")
    manager.create_task("p1", "r1", "t1", "Write report")
    output = manager.resolve_project_path("p1", "runs/r1/tasks/t1/artifacts/report.md")
    output.write_text("original")
    manifest = manager.build_manifest("p1", "r1", "t1", ["report.md"])
    attempt = TaskAttempt(id="a1", run_id="r1", task_id="t1", attempt=1, status=TaskStatus.COLLECTING)

    output.write_text("tampered")
    with pytest.raises(ArtifactVerificationError, match="哈希不匹配"):
        manager.finalize_success("p1", attempt, manifest)
    assert attempt.status is TaskStatus.COLLECTING

    output.write_text("original")
    manager.finalize_success("p1", attempt, manifest)
    assert attempt.status is TaskStatus.SUCCESS
    assert attempt.result_manifest == manifest.model_dump(mode="json")


def test_build_manifest_rejects_missing_or_outside_artifact(tmp_path):
    manager = ArtifactManager(tmp_path)
    manager.create_project(Project(id="p1", name="Demo", root_path=str(tmp_path / "p1")))
    manager.create_run("p1", "r1", "w1")
    manager.create_task("p1", "r1", "t1", "Write report")

    with pytest.raises(ArtifactVerificationError, match="missing"):
        manager.build_manifest("p1", "r1", "t1", ["missing.md"])
    with pytest.raises(UnsafePathError):
        manager.build_manifest("p1", "r1", "t1", ["../instruction.md"])
