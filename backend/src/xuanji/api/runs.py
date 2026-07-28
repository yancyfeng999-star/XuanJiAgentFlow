from __future__ import annotations

import uuid

from fastapi import APIRouter, Request, status

from xuanji.domain.enums import WorkflowStatus
from xuanji.domain.models import Run

from .errors import APIError

router = APIRouter(tags=["runs"])


def _services(request: Request):
    return request.app.state.services


def _run(request: Request, run_id: str) -> Run:
    run = _services(request).runs.get(run_id)
    if run is None:
        raise APIError(404, "run_not_found", "run not found", {"run_id": run_id})
    return run


def _run_payload(request: Request, run: Run) -> dict:
    payload = run.model_dump(mode="json")
    payload["attempts"] = [
        attempt.model_dump(mode="json")
        for attempt in _services(request).runs.list_attempts(run.id)
    ]
    return payload


@router.post("/api/workflows/{workflow_id}/runs", status_code=status.HTTP_201_CREATED)
async def create_run(workflow_id: str, request: Request) -> dict:
    services = _services(request)
    workflow = services.workflows.get(workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "workflow not found", {"workflow_id": workflow_id})
    if workflow.status is not WorkflowStatus.REVIEWED:
        raise APIError(409, "workflow_not_reviewed", "workflow must be reviewed before execution")
    run = Run(id=f"run-{uuid.uuid4().hex[:12]}", workflow_id=workflow.id)
    services.runs.create(run)
    services.artifacts.create_run(workflow.project_id, run.id, workflow.id)
    services.events.append(
        run.id,
        "run.created",
        {"workflow_id": workflow.id, "status": run.status.value},
    )
    return _run_payload(request, run)


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str, request: Request) -> dict:
    return _run_payload(request, _run(request, run_id))


@router.post("/api/runs/{run_id}/start", status_code=status.HTTP_202_ACCEPTED)
async def start_run(run_id: str, request: Request) -> dict:
    _run(request, run_id)
    services = _services(request)
    services.spawn_run_task(run_id, "start", services.execution.start(run_id))
    return {"id": run_id, "status": "accepted"}


@router.post("/api/runs/{run_id}/pause")
async def pause_run(run_id: str, request: Request) -> dict:
    _run(request, run_id)
    await _services(request).execution.pause(run_id)
    return _run_payload(request, _run(request, run_id))


@router.post("/api/runs/{run_id}/resume")
async def resume_run(run_id: str, request: Request) -> dict:
    _run(request, run_id)
    await _services(request).execution.resume(run_id)
    return _run_payload(request, _run(request, run_id))


@router.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str, request: Request) -> dict:
    _run(request, run_id)
    await _services(request).execution.cancel(run_id)
    return _run_payload(request, _run(request, run_id))


@router.post("/api/runs/{run_id}/tasks/{task_id}/retry")
async def retry_task(run_id: str, task_id: str, request: Request) -> dict:
    _run(request, run_id)
    try:
        attempt = await _services(request).execution.retry_task(run_id, task_id)
    except KeyError:
        raise APIError(404, "task_not_found", "task not found", {"task_id": task_id}) from None
    except ValueError as error:
        raise APIError(409, "task_not_retryable", str(error)) from None
    return attempt.model_dump(mode="json")


@router.post("/api/runs/{run_id}/tasks/{task_id}/skip")
async def skip_task(run_id: str, task_id: str, request: Request) -> dict:
    _run(request, run_id)
    try:
        await _services(request).execution.skip_task(run_id, task_id)
    except KeyError:
        raise APIError(404, "task_not_found", "task not found", {"task_id": task_id}) from None
    except ValueError as error:
        raise APIError(409, "task_not_skippable", str(error)) from None
    return _run_payload(request, _run(request, run_id))
