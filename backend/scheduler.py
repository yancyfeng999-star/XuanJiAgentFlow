import asyncio
from enum import Enum
from dataclasses import dataclass, field
from typing import Callable, Awaitable

class TaskStatus(str, Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    RUNNING = "running"
    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    SKIPPED = "skipped"

@dataclass
class TaskState:
    id: str
    title: str
    agent_type: str
    status: TaskStatus = TaskStatus.PENDING
    dependencies: list[str] = field(default_factory=list)
    result: str = ""
    error: str = ""
    retry_count: int = 0
    max_retries: int = 3

class Scheduler:
    def __init__(self, executor: Callable[[dict], Awaitable[str]], max_parallel: int = 5):
        self.executor = executor
        self.max_parallel = max_parallel
        self.tasks: dict[str, TaskState] = {}
        self._semaphore = asyncio.Semaphore(max_parallel)
        self._status_callbacks: list[Callable] = []

    def load_dag(self, nodes: list[dict]):
        for node in nodes:
            self.tasks[node["id"]] = TaskState(
                id=node["id"],
                title=node["title"],
                agent_type=node.get("agent_type", "research"),
                dependencies=node.get("dependencies", []),
                max_retries=node.get("max_retries", 3),
            )

    def on_status_change(self, callback: Callable):
        self._status_callbacks.append(callback)

    def _notify(self, task: TaskState):
        for cb in self._status_callbacks:
            cb(task.id, task.status.value, task.result)

    def _get_ready_tasks(self) -> list[TaskState]:
        ready = []
        for task in self.tasks.values():
            if task.status != TaskStatus.PENDING:
                continue
            deps_met = all(
                self.tasks[d].status == TaskStatus.SUCCESS or self.tasks[d].status == TaskStatus.SKIPPED
                for d in task.dependencies
            )
            if deps_met:
                ready.append(task)
        return ready

    def _get_dependency_results(self, task: TaskState) -> dict:
        results = {}
        for dep_id in task.dependencies:
            dep = self.tasks[dep_id]
            results[f"{dep_id}_output"] = dep.result
        return results

    async def _execute_task(self, task: TaskState, all_nodes: list[dict]):
        async with self._semaphore:
            task.status = TaskStatus.RUNNING
            self._notify(task)
            
            node = next((n for n in all_nodes if n["id"] == task.id), {})
            dep_results = self._get_dependency_results(task)
            
            instruction = {
                "goal": node.get("description", task.title),
                "context": dep_results,
                "agent_type": task.agent_type,
            }
            
            try:
                result = await asyncio.wait_for(
                    self.executor(instruction),
                    timeout=300,
                )
                task.result = result
                task.status = TaskStatus.SUCCESS
            except asyncio.TimeoutError:
                task.error = "timeout"
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.status = TaskStatus.PENDING
                else:
                    task.status = TaskStatus.TIMEOUT
            except Exception as e:
                task.error = str(e)
                if task.retry_count < task.max_retries:
                    task.retry_count += 1
                    task.status = TaskStatus.PENDING
                else:
                    task.status = TaskStatus.FAILED
            
            self._notify(task)

    async def run(self, nodes: list[dict]) -> dict:
        self.load_dag(nodes)
        
        while True:
            ready = self._get_ready_tasks()
            if not ready:
                all_done = all(
                    t.status in (TaskStatus.SUCCESS, TaskStatus.FAILED, TaskStatus.TIMEOUT, TaskStatus.SKIPPED)
                    for t in self.tasks.values()
                )
                if all_done:
                    break
                await asyncio.sleep(0.5)
                continue
            
            tasks_coro = [self._execute_task(t, nodes) for t in ready]
            await asyncio.gather(*tasks_coro)
        
        return {
            t.id: {"status": t.status.value, "result": t.result, "error": t.error}
            for t in self.tasks.values()
        }
