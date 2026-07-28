from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field, ValidationError

from xuanji.domain.enums import WorkflowStatus
from xuanji.domain.models import Task, Workflow

from .errors import APIError

router = APIRouter(tags=["workflows"])


class PlanRequest(BaseModel):
    goal: str = Field(min_length=1, max_length=200_000)
    context: str = ""
    constraints: dict[str, Any] = Field(default_factory=dict)


class UpdateWorkflowRequest(BaseModel):
    goal: str | None = Field(default=None, min_length=1)
    graph_json: dict[str, Any] | None = None
    tasks: list[Task]


def _services(request: Request):
    return request.app.state.services


def _workflow(request: Request, workflow_id: str) -> Workflow:
    workflow = _services(request).workflows.get(workflow_id)
    if workflow is None:
        raise APIError(404, "workflow_not_found", "workflow not found", {"workflow_id": workflow_id})
    return workflow


@router.post("/api/projects/{project_id}/plan", status_code=status.HTTP_201_CREATED)
async def plan(project_id: str, payload: PlanRequest, request: Request) -> dict:
    services = _services(request)
    project = services.projects.get(project_id)
    if project is None:
        raise APIError(404, "project_not_found", "project not found", {"project_id": project_id})
    if services.planner is None:
        raise APIError(
            503,
            "planner_not_configured",
            "planner is not configured",
            {"configured": False},
        )
    workflow = await services.planner.plan(
        project_id,
        payload.goal,
        payload.context,
        payload.constraints,
    )
    versions = services.workflows.list_versions(project_id)
    if versions:
        workflow.version = max(item.version for item in versions) + 1
    services.workflows.save(workflow)
    services.artifacts.save_workflow(project_id, workflow)
    return workflow.model_dump(mode="json")


@router.get("/api/workflows/{workflow_id}")
async def get_workflow(workflow_id: str, request: Request) -> dict:
    return _workflow(request, workflow_id).model_dump(mode="json")


@router.put("/api/workflows/{workflow_id}")
async def update_workflow(workflow_id: str, payload: UpdateWorkflowRequest, request: Request) -> dict:
    services = _services(request)
    workflow = _workflow(request, workflow_id)
    if workflow.status is not WorkflowStatus.DRAFT:
        raise APIError(409, "workflow_frozen", "reviewed workflows cannot be edited")
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
        raise APIError(422, "workflow_invalid", "workflow graph is invalid", error.errors()) from None
    services.workflows.update(updated)
    services.artifacts.save_workflow(updated.project_id, updated)
    return updated.model_dump(mode="json")


@router.post("/api/workflows/{workflow_id}/validate")
async def validate_workflow(workflow_id: str, request: Request) -> dict:
    workflow = _workflow(request, workflow_id)
    return {"valid": True, "topological_order": workflow.topological_order()}


@router.post("/api/workflows/{workflow_id}/review")
async def review_workflow(workflow_id: str, request: Request) -> dict:
    services = _services(request)
    workflow = _workflow(request, workflow_id)
    if workflow.status is WorkflowStatus.DRAFT:
        workflow.status = WorkflowStatus.REVIEWED
        services.workflows.update(workflow)
        services.artifacts.save_workflow(workflow.project_id, workflow)
    return workflow.model_dump(mode="json")
