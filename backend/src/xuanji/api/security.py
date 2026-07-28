from __future__ import annotations

from fastapi import APIRouter, Request, Response, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/security", tags=["security"])


class PasswordRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


class CredentialRequest(BaseModel):
    value: str = Field(min_length=1, max_length=1_000_000)


def _vault(request: Request):
    return request.app.state.services.vault


@router.get("/status")
async def security_status(request: Request) -> dict[str, str]:
    return {"status": _vault(request).status}


@router.post("/initialize", status_code=status.HTTP_201_CREATED)
async def initialize(payload: PasswordRequest, request: Request) -> dict[str, str]:
    vault = _vault(request)
    vault.initialize(payload.password)
    return {"status": vault.status}


@router.post("/unlock")
async def unlock(payload: PasswordRequest, request: Request) -> dict[str, str]:
    services = request.app.state.services
    services.vault.unlock(payload.password)
    await services.rebuild_node_clients()
    return {"status": services.vault.status}


@router.post("/lock")
async def lock(request: Request) -> dict[str, str]:
    services = request.app.state.services
    await services.close_node_clients()
    services.vault.lock()
    return {"status": services.vault.status}


@router.put("/credentials/{credential_key:path}", status_code=status.HTTP_204_NO_CONTENT)
async def set_credential(
    credential_key: str,
    payload: CredentialRequest,
    request: Request,
) -> Response:
    _vault(request).set(credential_key, payload.value)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
