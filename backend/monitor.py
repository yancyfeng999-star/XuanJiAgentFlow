import asyncio
import json
from fastapi import WebSocket

class Monitor:
    """监视器：管理WebSocket连接，推送任务状态"""

    def __init__(self):
        self.connections: dict[str, list[WebSocket]] = {}

    async def connect(self, run_id: str, ws: WebSocket):
        await ws.accept()
        if run_id not in self.connections:
            self.connections[run_id] = []
        self.connections[run_id].append(ws)

    def disconnect(self, run_id: str, ws: WebSocket):
        if run_id in self.connections:
            self.connections[run_id] = [
                c for c in self.connections[run_id] if c != ws
            ]
            if not self.connections[run_id]:
                del self.connections[run_id]

    async def broadcast(self, run_id: str, message: dict):
        if run_id not in self.connections:
            return
        dead = []
        for ws in self.connections[run_id]:
            try:
                await ws.send_json(message)
            except:
                dead.append(ws)
        for ws in dead:
            self.connections[run_id].remove(ws)

    async def notify_task_started(self, run_id: str, task_id: str, title: str):
        await self.broadcast(run_id, {
            "type": "task_started",
            "task_id": task_id,
            "title": title,
        })

    async def notify_task_progress(self, run_id: str, task_id: str, message: str):
        await self.broadcast(run_id, {
            "type": "task_progress",
            "task_id": task_id,
            "message": message,
        })

    async def notify_task_completed(self, run_id: str, task_id: str, result: str):
        await self.broadcast(run_id, {
            "type": "task_completed",
            "task_id": task_id,
            "result": result,
        })

    async def notify_task_failed(self, run_id: str, task_id: str, error: str):
        await self.broadcast(run_id, {
            "type": "task_failed",
            "task_id": task_id,
            "error": error,
        })

    async def notify_run_completed(self, run_id: str):
        await self.broadcast(run_id, {
            "type": "run_completed",
            "run_id": run_id,
        })

    async def notify_run_failed(self, run_id: str, error: str):
        await self.broadcast(run_id, {
            "type": "run_failed",
            "run_id": run_id,
            "error": error,
        })

# 全局监视器实例
monitor = Monitor()
