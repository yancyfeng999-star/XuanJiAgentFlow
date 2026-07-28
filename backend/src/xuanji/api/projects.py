from __future__ import annotations

import uuid
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from xuanji.domain.models import Project

from .errors import APIError

router = APIRouter(prefix="/api/projects", tags=["projects"])


class CreateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    root_path: str | None = None


class UpdateProjectRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)


def _services(request: Request):
    return request.app.state.services


def _project(request: Request, project_id: str) -> Project:
    project = _services(request).projects.get(project_id)
    if project is None:
        raise APIError(404, "project_not_found", "project not found", {"project_id": project_id})
    return project


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_project(payload: CreateProjectRequest, request: Request) -> dict:
    services = _services(request)
    project_id = f"project-{uuid.uuid4().hex[:12]}"
    root = Path(payload.root_path) if payload.root_path else services.config.projects_dir / project_id
    project = Project(id=project_id, name=payload.name, root_path=str(root))
    services.artifacts.create_project(project)
    services.projects.create(project)
    return project.model_dump(mode="json")


@router.get("")
async def list_projects(request: Request) -> list[dict]:
    return [project.model_dump(mode="json") for project in _services(request).projects.list()]


@router.get("/{project_id}")
async def get_project(project_id: str, request: Request) -> dict:
    return _project(request, project_id).model_dump(mode="json")


@router.patch("/{project_id}")
async def update_project(project_id: str, payload: UpdateProjectRequest, request: Request) -> dict:
    project = _project(request, project_id)
    project.name = payload.name
    project.updated_at = datetime.now(timezone.utc)
    _services(request).projects.update(project)
    return project.model_dump(mode="json")


@router.delete("/{project_id}")
async def delete_project(project_id: str, request: Request) -> dict:
    project = _project(request, project_id)
    _services(request).projects.delete(project_id)
    return {
        "deleted": True,
        "artifacts_retained": True,
        "root_path": project.root_path,
    }
