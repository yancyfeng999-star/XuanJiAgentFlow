from fastapi import APIRouter, Request

from xuanji.diagnostics import build_diagnostics

router = APIRouter(tags=["diagnostics"])


@router.get("/api/diagnostics")
async def diagnostics(request: Request) -> dict:
    return build_diagnostics(request.app.state.services)
