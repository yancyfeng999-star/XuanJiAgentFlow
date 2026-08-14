from __future__ import annotations

import asyncio

from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from xuanji.storage.repositories import StoredEvent

router = APIRouter(tags=["events"])

_ALLOWED_ORIGINS = {"tauri://localhost", "http://tauri.localhost"}


def _origin_allowed(origin: str | None) -> bool:
    if origin is None:
        return True
    if origin in _ALLOWED_ORIGINS:
        return True
    if not origin.startswith("http://"):
        return False
    authority = origin.removeprefix("http://")
    host, separator, port = authority.partition(":")
    return host in {"localhost", "127.0.0.1"} and (not separator or port.isdigit())


def _payload(event: StoredEvent) -> dict:
    return {
        "event_id": event.event_id,
        "run_id": event.run_id,
        "type": event.event_type,
        "payload": event.payload,
        "created_at": event.created_at.isoformat(),
    }


@router.websocket("/ws/runs/{run_id}")
async def run_events(
    websocket: WebSocket,
    run_id: str,
    last_event_id: int = Query(default=0, ge=0),
) -> None:
    if not _origin_allowed(websocket.headers.get("origin")):
        await websocket.close(code=4403, reason="不允许当前来源建立连接")
        return
    services = websocket.app.state.services
    if services.config.session_token:
        ticket = websocket.query_params.get("ticket", "")
        if not services.session_tickets.consume(ticket, run_id):
            await websocket.close(code=4401, reason="事件票据无效或已过期")
            return
    await websocket.accept()
    if services.runs.get(run_id) is None:
        await websocket.close(code=4404, reason="运行记录不存在")
        return
    cursor = last_event_id
    try:
        while True:
            events = services.events.list_for_run(run_id, after_event_id=cursor, limit=100)
            for event in events:
                if event.event_id <= cursor:
                    continue
                await websocket.send_json(_payload(event))
                cursor = event.event_id
            try:
                message = await asyncio.wait_for(
                    websocket.receive(),
                    timeout=min(services.config.poll_interval, 0.05),
                )
            except asyncio.TimeoutError:
                continue
            if message["type"] == "websocket.disconnect":
                return
    except (WebSocketDisconnect, RuntimeError):
        return
