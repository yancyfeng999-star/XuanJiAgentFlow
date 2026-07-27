import json
import uuid
import asyncio
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from planner import plan
from scheduler import Scheduler
from executor import get_executor
from storage import init_db, save_run, get_run, list_runs, update_task_status, update_run_status
from collector import collect_results, export_to_text
from monitor import monitor

app = FastAPI(title="璇玑 AgentFlow API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.on_event("startup")
def startup():
    init_db()

# ─── 请求模型 ───

class PlanRequest(BaseModel):
    goal: str
    context: str = ""
    constraints: dict = None

class ExportRequest(BaseModel):
    run_id: str

# ─── 系统状态 ───

@app.get("/api/status")
def status():
    runs = list_runs(100)
    return {"status": "ok", "runs": len(runs)}

# ─── 规划器 ───

@app.post("/api/plan")
async def plan_run(req: PlanRequest):
    result = await plan(req.goal, req.context, req.constraints)
    run_id = f"run_{uuid.uuid4().hex[:8]}"

    nodes = result.get("nodes", [])
    for i, node in enumerate(nodes):
        if "id" not in node:
            node["id"] = f"task_{i+1}"
        node.setdefault("status", "pending")
        node.setdefault("dependencies", [])
        node.setdefault("max_retries", 3)

    save_run(run_id, req.goal, nodes, result.get("thinking", ""), "planned")
    return {"id": run_id, "goal": req.goal, "thinking": result.get("thinking", ""), "nodes": nodes, "status": "planned"}

# ─── 运行管理 ───

@app.get("/api/runs")
def api_list_runs():
    return list_runs()

@app.get("/api/runs/{run_id}")
def api_get_run(run_id: str):
    run = get_run(run_id)
    if not run:
        return {"error": "not found"}
    return run

@app.post("/api/runs/{run_id}/start")
async def start_run(run_id: str):
    run = get_run(run_id)
    if not run:
        return {"error": "not found"}

    update_run_status(run_id, "running")
    executor = get_executor()

    scheduler = Scheduler(executor=executor, max_parallel=5)

    def on_status(task_id, status, result):
        update_task_status(task_id, status, result)
        asyncio.get_event_loop().create_task(
            monitor.broadcast(run_id, {"type": "task_status", "task_id": task_id, "status": status, "result": result[:200] if result else ""})
        )

    scheduler.on_status_change(on_status)

    try:
        results = await scheduler.run(run["nodes"])
        update_run_status(run_id, "completed")
        await monitor.notify_run_completed(run_id)
        return {"status": "completed", "results": results}
    except Exception as e:
        update_run_status(run_id, "failed")
        await monitor.notify_run_failed(run_id, str(e))
        return {"status": "failed", "error": str(e)}

@app.post("/api/runs/{run_id}/cancel")
async def cancel_run(run_id: str):
    update_run_status(run_id, "failed")
    return {"status": "cancelled"}

# ─── 导出器 ───

@app.post("/api/export")
def export_run(req: ExportRequest):
    text = export_to_text(req.run_id)
    return {"text": text}

# ─── 收集器 ───

@app.get("/api/runs/{run_id}/results")
def get_results(run_id: str):
    return collect_results(run_id)

# ─── WebSocket 监视器 ───

@app.websocket("/ws/runs/{run_id}")
async def websocket_endpoint(websocket: WebSocket, run_id: str):
    await monitor.connect(run_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            # 客户端消息暂不处理
    except WebSocketDisconnect:
        monitor.disconnect(run_id, websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
