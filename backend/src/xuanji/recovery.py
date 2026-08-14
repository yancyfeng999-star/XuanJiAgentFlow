from __future__ import annotations

from pydantic import BaseModel


class RecoveryState(BaseModel):
    safe_mode: bool = False
    reason_code: str | None = None
    latest_verified_backup: str | None = None
    available_actions: list[str] = ["open_diagnostics", "reset_ui_state"]


def current_recovery_state() -> RecoveryState:
    return RecoveryState()
