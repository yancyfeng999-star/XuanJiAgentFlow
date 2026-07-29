from __future__ import annotations

from .manager import ExecutionManager


class RecoveryService:
    def __init__(self, manager: ExecutionManager) -> None:
        self.manager = manager

    async def recover_all(self) -> None:
        for recoverable in self.manager.runs.list_recoverable():
            await self.manager.recover(recoverable.run.id)
