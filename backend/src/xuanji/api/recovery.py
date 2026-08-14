from fastapi import APIRouter

from xuanji.recovery import current_recovery_state

router = APIRouter(tags=["recovery"])


@router.get("/api/recovery")
async def recovery() -> dict:
    return current_recovery_state().model_dump()
