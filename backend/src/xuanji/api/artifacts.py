from __future__ import annotations

import hashlib
from pathlib import PurePosixPath

from fastapi import APIRouter, Query, Request
from fastapi.responses import FileResponse

from .errors import APIError

router = APIRouter(tags=["artifacts"])


def _services(request: Request):
    return request.app.state.services


def _run_context(request: Request, run_id: str):
    services = _services(request)
    run = services.runs.get(run_id)
    if run is None:
        raise APIError(404, "run_not_found", "run not found", {"run_id": run_id})
    workflow = services.workflows.get(run.workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "workflow not found")
    return services, run, workflow


@router.get("/api/runs/{run_id}/artifacts")
async def list_artifacts(run_id: str, request: Request) -> dict:
    services, _, _ = _run_context(request, run_id)
    return {
        "artifacts": [
            artifact.model_dump(mode="json")
            for artifact in services.artifact_repository.list_for_run(run_id)
        ]
    }


@router.get("/api/runs/{run_id}/artifacts/download")
async def download_artifact(
    run_id: str,
    request: Request,
    path: str = Query(min_length=1),
) -> FileResponse:
    services, _, workflow = _run_context(request, run_id)
    artifact = next(
        (
            item
            for item in services.artifact_repository.list_for_run(run_id)
            if item.relative_path == path
        ),
        None,
    )
    if artifact is None:
        raise APIError(404, "artifact_not_found", "artifact not found")
    relative = PurePosixPath(path)
    if relative.is_absolute() or ".." in relative.parts:
        raise APIError(404, "artifact_not_found", "artifact not found")
    file_path = services.artifacts.resolve_project_path(workflow.project_id, path)
    if not file_path.is_file():
        raise APIError(404, "artifact_not_found", "artifact not found")
    digest = hashlib.sha256()
    size = 0
    with file_path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            size += len(chunk)
            digest.update(chunk)
    if size != artifact.size or digest.hexdigest() != artifact.sha256:
        raise APIError(
            409,
            "artifact_integrity_error",
            "artifact failed integrity verification",
            {"path": path},
        )
    return FileResponse(file_path, media_type=artifact.media_type, filename=file_path.name)
