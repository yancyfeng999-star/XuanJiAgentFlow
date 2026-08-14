from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field, ValidationError

from xuanji.domain.enums import WorkflowStatus
from xuanji.domain.models import Task, Workflow
from xuanji.workflow_review import prepare_review, snapshot_hash

from .errors import APIError, safe_validation_errors

router = APIRouter(tags=["workflows"])


class PlanRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=200_000)
    context: str = ""
    constraints: dict[str, Any] = Field(default_factory=dict)
    thinking_model_id: str | None = None


class UpdateWorkflowRequest(BaseModel):
    goal: str | None = Field(default=None, min_length=1)
    graph_json: dict[str, Any] | None = None
    tasks: list[Task]


class ReviewWorkflowRequest(BaseModel):
    snapshot_hash: str = Field(min_length=64, max_length=64)
    acknowledged_warnings: list[str] = Field(default_factory=list)


def _services(request: Request):
    return request.app.state.services


def _workflow(request: Request, workflow_id: str) -> Workflow:
    workflow = _services(request).workflows.get(workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "工作流不存在", {"workflow_id": workflow_id})
    return workflow


@router.post("/api/projects/{project_id}/plan", status_code=status.HTTP_201_CREATED)
async def plan(project_id: str, payload: PlanRequest, request: Request) -> dict:
    services = _services(request)
    project = services.projects.get(project_id)
    if project is None:
        raise APIError(404, "project_not_found", "项目不存在", {"project_id": project_id})
    profile = None
    if services.thinking_models is not None:
        if payload.thinking_model_id:
            profile = services.thinking_models.repository.get(payload.thinking_model_id)
        else:
            profile = services.thinking_models.repository.default()
        if payload.thinking_model_id and profile is None:
            raise APIError(404, "thinking_model_not_found", "思考模型不存在", {"id": payload.thinking_model_id})
        if profile is not None and not profile.enabled:
            raise APIError(409, "thinking_model_disabled", "思考模型已停用", {"id": profile.id})
        if profile is not None and (services.planner is None or payload.thinking_model_id):
            from xuanji.thinking_models.providers import provider_for
            from xuanji.planner.service import PlannerService

            provider = provider_for(profile, services.credentials)
            services.planner = PlannerService(provider, model=profile.model_id, provider_name=profile.api_mode)
    if services.planner is None:
        raise APIError(
            503,
            "planner_not_configured",
            "规划器尚未配置，请先前往“设置”完成配置",
            {"configured": False},
        )
    workflow = await services.planner.plan(
        project_id,
        payload.goal,
        payload.context,
        payload.constraints,
    )
    if profile is not None:
        workflow.thinking_model_id = profile.id
        workflow.planner_provider = profile.api_mode
        workflow.planner_model = profile.model_id
    versions = services.workflows.list_versions(project_id)
    if versions:
        workflow.version = max(item.version for item in versions) + 1
    services.workflows.save(workflow)
    services.artifacts.save_workflow(project_id, workflow)
    return workflow.model_dump(mode="json")


@router.get("/api/projects/{project_id}/workflow")
async def get_project_workflow(project_id: str, request: Request) -> dict | None:
    services = _services(request)
    if services.projects.get(project_id) is None:
        raise APIError(404, "project_not_found", "项目不存在", {"project_id": project_id})
    workflow = services.workflows.get_active(project_id)
    return workflow.model_dump(mode="json") if workflow else None


@router.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request) -> dict:
    return _workflow(request, workflow_id).model_dump(mode="json")


@router.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, payload: UpdateWorkflowRequest, request: Request) -> dict:
    services = _services(request)
    workflow = _workflow(request, workflow_id)
    if workflow.status is not WorkflowStatus.DRAFT:
        raise APIError(409, "workflow_frozen", "工作流已审核冻结，不能继续编辑")
    try:
        updated = workflow.model_copy(
            update={
                "goal": payload.goal or workflow.goal,
                "graph_json": payload.graph_json if payload.graph_json is not None else workflow.graph_json,
                "tasks": payload.tasks,
            }
        )
        updated = Workflow.model_validate(updated.model_dump())
    except ValidationError as error:
        raise APIError(
            422,
            "workflow_invalid",
            "工作流结构校验失败",
            {"errors": safe_validation_errors(error.errors())},
        ) from None
    services.workflows.update(updated)
    services.artifacts.save_workflow(updated.project_id, updated)
    return updated.model_dump(mode="json")


@router.post("/api/workflows/{workflow_id}/validate")
async def validate_workflow(workflow_id: str, request: Request) -> dict:
    workflow = _workflow(request, workflow_id)
    return {"valid": True, "topological_order": workflow.topological_order()}


@router.post("/api/workflows/{workflow_id}/review/prepare")
async def prepare_workflow_review(workflow_id: str, request: Request) -> dict:
    services = _services(request)
    workflow = _workflow(request, workflow_id)
    return prepare_review(workflow, services.nodes.list())


@router.post("/api/workflows/{workflow_id}/review")
async def review_workflow(workflow_id: str, payload: ReviewWorkflowRequest, request: Request) -> dict:
    services = _services(request)
    workflow = _workflow(request, workflow_id)
    if workflow.status is not WorkflowStatus.DRAFT:
        return workflow.model_dump(mode="json")
    prepared = prepare_review(workflow, services.nodes.list())
    if payload.snapshot_hash != prepared["snapshot_hash"]:
        raise APIError(
            409,
            "review_snapshot_stale",
            "工作流在审核准备后已被修改，请重新打开审核",
            {"expected": prepared["snapshot_hash"]},
        )
    if prepared["blockers"]:
        raise APIError(
            409,
            "review_blocked",
            "工作流存在阻塞项，不能审核",
            {"blockers": prepared["blockers"]},
        )
    warning_codes = {warning["code"] for warning in prepared["warnings"]}
    unacknowledged = sorted(warning_codes - set(payload.acknowledged_warnings))
    if unacknowledged:
        raise APIError(
            409,
            "review_warnings_unacknowledged",
            "存在未确认的警告，请逐项确认后再审核",
            {"unacknowledged": unacknowledged, "warnings": prepared["warnings"]},
        )
    workflow.status = WorkflowStatus.REVIEWED
    workflow.reviewed_at = datetime.now(timezone.utc)
    workflow.reviewed_by = "user"
    workflow.review_snapshot_hash = prepared["snapshot_hash"]
    workflow.review_warnings = sorted(warning_codes)
    services.workflows.update(workflow)
    services.artifacts.save_workflow(workflow.project_id, workflow)
    return workflow.model_dump(mode="json")


@router.post("/api/workflows/{workflow_id}/revisions", status_code=status.HTTP_201_CREATED)
async def create_workflow_revision(workflow_id: str, request: Request) -> dict:
    services = _services(request)
    source = _workflow(request, workflow_id)
    if source.status is not WorkflowStatus.REVIEWED:
        raise APIError(
            409,
            "revision_source_not_reviewed",
            "只能从已审核的工作流创建修订",
            {"workflow_id": workflow_id},
        )
    versions = services.workflows.list_versions(source.project_id)
    next_version = max((item.version for item in versions), default=source.version) + 1
    revision_id = f"workflow-{uuid.uuid4().hex[:12]}"
    revision = Workflow(
        id=revision_id,
        project_id=source.project_id,
        version=next_version,
        goal=source.goal,
        planner_provider=source.planner_provider,
        planner_model=source.planner_model,
        status=WorkflowStatus.DRAFT,
        graph_json=dict(source.graph_json),
        tasks=[
            task.model_copy(update={"workflow_id": revision_id})
            for task in source.tasks
        ],
    )
    services.workflows.save(revision)
    services.artifacts.save_workflow(source.project_id, revision)
    return revision.model_dump(mode="json")
