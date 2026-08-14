from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, Query, Request, status

from xuanji.domain.enums import RunStatus, WorkflowStatus
from xuanji.domain.models import Run
from xuanji.run_actions import run_allowed_actions, task_allowed_actions

from .errors import APIError

router = APIRouter(tags=["runs"])


async def _require_ready(request: Request, project_id: str, workflow_id: str) -> None:
    services = _services(request)
    if services.readiness is None:
        return
    result = await services.readiness.check(project_id=project_id, workflow_id=workflow_id)
    if not result["ready"]:
        raise APIError(
            409,
            "run_not_ready",
            "执行条件未满足，请先处理阻塞项",
            {"issues": result["issues"], "checks": result["checks"]},
        )


def _services(request: Request):
    return request.app.state.services


def _run(request: Request, run_id: str) -> Run:
    run = _services(request).runs.get(run_id)
    if run is None:
        raise APIError(404, "run_not_found", "运行记录不存在", {"run_id": run_id})
    return run


def _run_payload(request: Request, run: Run) -> dict:
    services = _services(request)
    payload = run.model_dump(mode="json")
    workflow = services.workflows.get(run.workflow_id)
    latest = services.runs.latest_attempts(run.id)
    attempts = []
    for attempt in services.runs.list_attempts(run.id):
        attempt_payload = attempt.model_dump(mode="json")
        task = next((item for item in (workflow.tasks if workflow else []) if item.id == attempt.task_id), None)
        attempt_payload["allowed_actions"] = (
            task_allowed_actions(run, task, latest.get(attempt.task_id)) if task else []
        )
        attempts.append(attempt_payload)
    payload["attempts"] = attempts
    payload["allowed_actions"] = run_allowed_actions(run)
    if workflow is not None:
        payload["workflow_version"] = workflow.version
        payload["review_snapshot_hash"] = workflow.review_snapshot_hash
    return payload


def _workflow_for_run(request: Request, run: Run):
    workflow = _services(request).workflows.get(run.workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "工作流不存在")
    return workflow


@router.post("/api/workflows/{workflow_id}/runs", status_code=status.HTTP_201_CREATED)
async def create_run(workflow_id: str, request: Request) -> dict:
    services = _services(request)
    workflow = services.workflows.get(workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "工作流不存在", {"workflow_id": workflow_id})
    if workflow.status is not WorkflowStatus.REVIEWED:
        raise APIError(409, "workflow_not_reviewed", "工作流必须先审核，才能开始执行")
    await _require_ready(request, workflow.project_id, workflow.id)
    run = Run(id=f"run-{uuid.uuid4().hex[:12]}", workflow_id=workflow.id)
    services.runs.create(run)
    services.artifacts.create_run(workflow.project_id, run.id, workflow.id)
    services.events.append(
        run.id,
        "run.created",
        {"workflow_id": workflow.id, "status": run.status.value},
    )
    return _run_payload(request, run)


@router.get("/api/projects/{project_id}/runs")
async def list_project_runs(
    project_id: str,
    request: Request,
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
) -> dict:
    services = _services(request)
    if services.projects.get(project_id) is None:
        raise APIError(404, "project_not_found", "项目不存在", {"project_id": project_id})
    runs, next_cursor = services.runs.list_for_project(project_id, limit=limit, cursor=cursor)
    summaries = []
    for run in runs:
        workflow = services.workflows.get(run.workflow_id)
        latest = services.runs.latest_attempts(run.id)
        status_counts: dict[str, int] = {}
        for attempt in latest.values():
            status_counts[attempt.status.value] = status_counts.get(attempt.status.value, 0) + 1
        summaries.append({
            "id": run.id,
            "workflow_id": run.workflow_id,
            "workflow_version": workflow.version if workflow else None,
            "review_snapshot_hash": workflow.review_snapshot_hash if workflow else None,
            "status": run.status.value,
            "created_at": run.created_at.isoformat(),
            "started_at": run.started_at.isoformat() if run.started_at else None,
            "completed_at": run.completed_at.isoformat() if run.completed_at else None,
            "allowed_actions": run_allowed_actions(run),
            "task_count": len(workflow.tasks) if workflow else 0,
            "task_status_counts": status_counts,
        })
    return {"runs": summaries, "next_cursor": next_cursor}


@router.get("/api/runs/{run_id}")
async def get_run(run_id: str, request: Request) -> dict:
    return _run_payload(request, _run(request, run_id))


@router.post("/api/runs/{run_id}/start", status_code=status.HTTP_202_ACCEPTED)
async def start_run(run_id: str, request: Request) -> dict:
    run = _run(request, run_id)
    workflow = _workflow_for_run(request, run)
    await _require_ready(request, workflow.project_id, workflow.id)
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
        raise APIError(404, "task_not_found", "任务不存在", {"task_id": task_id}) from None
    except ValueError as error:
        raise APIError(409, "task_not_retryable", "当前任务不可重试") from None
    return attempt.model_dump(mode="json")


@router.post("/api/runs/{run_id}/tasks/{task_id}/skip")
async def skip_task(run_id: str, task_id: str, request: Request) -> dict:
    _run(request, run_id)
    try:
        await _services(request).execution.skip_task(run_id, task_id)
    except KeyError:
        raise APIError(404, "task_not_found", "任务不存在", {"task_id": task_id}) from None
    except ValueError as error:
        raise APIError(409, "task_not_skippable", "当前任务不可跳过") from None
    return _run_payload(request, _run(request, run_id))


@router.get("/api/runs/{run_id}/tasks/{task_id}/logs")
async def list_task_logs(
    run_id: str,
    task_id: str,
    request: Request,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
) -> dict:
    run = _run(request, run_id)
    workflow = _workflow_for_run(request, run)
    if not any(task.id == task_id for task in workflow.tasks):
        raise APIError(404, "task_not_found", "任务不存在", {"task_id": task_id})
    services = _services(request)
    log_path = services.artifacts.resolve_project_path(
        workflow.project_id,
        f"runs/{run_id}/tasks/{task_id}/logs.jsonl",
    )
    events: list[dict] = []
    if log_path.is_file():
        lines = log_path.read_text(encoding="utf-8").splitlines()
        page = lines[offset : offset + limit]
        for line in page:
            text = line.strip()
            if not text:
                continue
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                events.append({"message": text})
                continue
            if isinstance(parsed, dict):
                events.append(parsed)
            else:
                events.append({"message": text})
    next_offset = offset + len(events)
    return {"offset": offset, "next_offset": next_offset, "events": events}
