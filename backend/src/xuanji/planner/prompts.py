from __future__ import annotations

import json
from typing import Any


SYSTEM_PROMPT = """Create a task workflow for the user's goal.
Return only one JSON object accepted by the supplied Workflow schema.
The workflow must be a directed acyclic graph. Every task workflow_id must match the workflow id.
Do not wrap the JSON in commentary or Markdown code fences."""


def planning_messages(
    goal: str,
    context: str,
    constraints: dict[str, Any],
) -> list[dict[str, str]]:
    user_content = (
        f"Goal:\n{goal}\n\n"
        f"Context:\n{context}\n\n"
        f"Constraints:\n{json.dumps(constraints, ensure_ascii=False, sort_keys=True)}"
    )
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def repair_messages(
    messages: list[dict[str, str]],
    invalid_output: str,
) -> list[dict[str, str]]:
    return [
        *messages,
        {"role": "assistant", "content": invalid_output},
        {
            "role": "user",
            "content": (
                "The previous output is invalid JSON, violates the Workflow schema, "
                "or is not a DAG. Return one corrected JSON object only.\n\n"
                f"Invalid output:\n{invalid_output}"
            ),
        },
    ]
