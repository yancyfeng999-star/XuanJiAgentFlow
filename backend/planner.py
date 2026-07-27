import json
import httpx
from model_config import get_model_config

PLANNER_PROMPT = """你是一个任务规划专家。用户会给你一个选题/目标。

请按以下步骤思考：

1. **理解**：这个选题是什么领域？涉及哪些知识点？目标受众是谁？产出应该是什么形态？
2. **梳理**：需要哪些前置调研？可以分成几个板块？板块间的逻辑关系是什么？
3. **拆解**：每个板块下拆成具体任务，标注Agent类型（research/code/business/review）、预估耗时、产出格式。
4. **编排**：分析依赖关系，标注哪些可以并行，确定执行顺序。

输出严格的JSON格式（不要输出其他内容）：

```json
{
  "thinking": "你的思考过程...",
  "nodes": [
    {
      "id": "task_1",
      "title": "任务标题",
      "description": "具体描述",
      "agent_type": "research",
      "dependencies": [],
      "estimated_time": "5min",
      "output_format": "markdown表格"
    }
  ],
  "parallel_groups": [["task_1", "task_2"]]
}
```

Agent类型说明：
- research：联网搜索、读文档、分析
- code：写代码、调试、部署
- business：API调用、数据处理、爬虫
- review：检查产出质量"""

async def plan(goal: str, context: str = "", constraints: dict = None) -> dict:
    """调用LLM规划任务DAG"""
    base_url, api_key, model, params = get_model_config("planner")
    
    user_msg = f"选题/目标：{goal}"
    if context:
        user_msg += f"\n\n背景信息：{context}"
    if constraints:
        user_msg += f"\n\n约束条件：{json.dumps(constraints, ensure_ascii=False)}"
    
    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": PLANNER_PROMPT},
            {"role": "user", "content": user_msg},
        ],
        **params,
    }
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    
    async with httpx.AsyncClient(timeout=120) as client:
        resp = await client.post(
            f"{base_url}/chat/completions",
            json=payload,
            headers=headers,
        )
        resp.raise_for_status()
        data = resp.json()
    
    content = data["choices"][0]["message"]["content"]
    
    # 提取JSON
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]
    
    return json.loads(content.strip())
