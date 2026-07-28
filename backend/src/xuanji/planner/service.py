from __future__ import annotations

import json
from typing import Any

from pydantic import ValidationError

from xuanji.domain import Workflow

from .prompts import planning_messages, repair_messages
from .providers import PlannerError, PlannerProvider


class PlannerService:
    def __init__(self, provider: PlannerProvider, *, model: str, provider_name: str):
        self._provider = provider
        self._model = model
        self._provider_name = provider_name

    async def plan(
        self,
        project_id: str,
        goal: str,
        context: str,
        constraints: dict[str, Any],
    ) -> Workflow:
        messages = planning_messages(goal, context, constraints)
        output = await self._provider.complete(messages, self._model)

        for attempt in range(2):
            try:
                return self._workflow(output, project_id, goal)
            except (json.JSONDecodeError, ValidationError, TypeError):
                if attempt == 1:
                    raise PlannerError(
                        "planner_invalid_output",
                        "planner output is invalid after repair",
                    ) from None
                output = await self._provider.complete(
                    repair_messages(messages, output),
                    self._model,
                )

        raise AssertionError("unreachable")

    def _workflow(self, output: str, project_id: str, goal: str) -> Workflow:
        payload = json.loads(_strip_code_fence(output))
        if not isinstance(payload, dict):
            raise TypeError("planner output must be a JSON object")
        payload["project_id"] = project_id
        payload["goal"] = goal
        payload["planner_provider"] = self._provider_name
        payload["planner_model"] = self._model
        return Workflow.model_validate(payload)


def _strip_code_fence(output: str) -> str:
    stripped = output.strip()
    if not stripped.startswith("```"):
        return stripped
    first_line, separator, remainder = stripped.partition("\n")
    if not separator or not remainder.rstrip().endswith("```"):
        return stripped
    return remainder.rstrip()[:-3].strip()
