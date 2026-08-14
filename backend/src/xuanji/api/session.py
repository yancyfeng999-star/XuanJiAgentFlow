from __future__ import annotations

from fastapi import APIRouter, Request, status
from pydantic import BaseModel, Field

from .errors import APIError

router = APIRouter(tags=["session"])


class WsTicketRequest(BaseModel):
    run_id: str = Field(min_length=1)


@router.post("/api/session/ws-tickets", status_code=status.HTTP_201_CREATED)
async def create_ws_ticket(payload: WsTicketRequest, request: Request) -> dict:
    services = request.app.state.services
    if services.runs.get(payload.run_id) is None:
        raise APIError(404, "run_not_found", "运行记录不存在", {"run_id": payload.run_id})
    return services.session_tickets.issue(payload.run_id)
