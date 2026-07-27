import httpx
import json
from model_config import get_config

async def execute_via_hermes(instruction: dict) -> str:
    """调用Hermes API执行单个任务"""
    config = get_config()
    hermes = config.get("hermes", {})
    base_url = hermes.get("base_url", "http://localhost:8001")
    timeout = hermes.get("timeout", 300)

    goal = instruction.get("goal", "")
    context = instruction.get("context", {})
    agent_type = instruction.get("agent_type", "research")

    # 组装prompt
    prompt = goal
    if context:
        context_text = "\n".join(f"[{k}] {v}" for k, v in context.items() if v)
        if context_text:
            prompt = f"前置任务产出：\n{context_text}\n\n当前任务：{goal}"

    payload = {
        "tasks": [
            {
                "goal": prompt,
                "context": f"Agent类型: {agent_type}",
                "role": "leaf",
            }
        ]
    }

    async with httpx.AsyncClient(timeout=timeout) as client:
        resp = await client.post(
            f"{base_url}/api/delegate",
            json=payload,
            headers={"Content-Type": "application/json"},
        )
        resp.raise_for_status()
        data = resp.json()

    # 提取结果
    if isinstance(data, dict):
        results = data.get("results", [])
        if results:
            return results[0].get("summary", json.dumps(results[0], ensure_ascii=False))
        return json.dumps(data, ensure_ascii=False)
    return str(data)


async def execute_stub(instruction: dict) -> str:
    """Stub执行器，不调用真实API，用于测试"""
    goal = instruction.get("goal", "")
    return f"[Stub执行完成] {goal}"


def get_executor():
    """根据配置返回执行器"""
    config = get_config()
    hermes = config.get("hermes", {})
    base_url = hermes.get("base_url", "http://localhost:8001")

    # 检查Hermes是否在线
    try:
        import socket
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(1)
        s.connect(("127.0.0.1", 8001))
        s.close()
        return execute_via_hermes
    except:
        return execute_stub
