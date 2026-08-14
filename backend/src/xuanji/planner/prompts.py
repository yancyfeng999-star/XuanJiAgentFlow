from __future__ import annotations

import json
from typing import Any


SYSTEM_PROMPT = """请根据用户目标创建任务工作流。
只返回一个符合所提供工作流结构定义的数据对象。
工作流必须是有向无环图，每个任务的工作流标识必须与工作流标识一致。
所有用户可见的任务标题、描述和任务指令都必须使用简体中文。
每个任务必须给出 writes（计划写入的相对路径）、done_definition（完成判据）和 verify（验证步骤，kind 为 command/file_exists/sha256/manual）。
不要添加解释文字，也不要使用代码块包裹返回结果。"""


def planning_messages(
    goal: str,
    context: str,
    constraints: dict[str, Any],
    workflow_schema: dict[str, Any],
) -> list[dict[str, str]]:
    user_content = (
        f"目标：\n{goal}\n\n"
        f"上下文：\n{context}\n\n"
        f"约束：\n{json.dumps(constraints, ensure_ascii=False, sort_keys=True)}\n\n"
        f"工作流数据结构：\n{json.dumps(workflow_schema, ensure_ascii=False, sort_keys=True)}"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def repair_messages(
    messages: list[dict[str, str]],
    invalid_output: str,
    validation_error: str,
) -> list[dict[str, str]]:
    return [
        *messages,
        {"role": "assistant", "content": invalid_output},
        {
            "role": "user",
            "content": (
                "上一次输出不是有效的数据对象、不符合工作流结构，或不是有向无环图。"
                "请只返回一个修正后的数据对象。\n\n"
                f"校验错误：\n{validation_error}\n\n"
                f"无效输出：\n{invalid_output}"
            ),
        },
    ]
