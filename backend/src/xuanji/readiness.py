from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import TYPE_CHECKING, Any, Literal

from xuanji.domain.enums import NodeStatus, WorkflowStatus
from xuanji.domain.models import HermesNode, Task, Workflow
from xuanji.nodes.registry import supports_task

if TYPE_CHECKING:
    from xuanji.api.app import Services

ReadinessMode = Literal["local", "deep"]
CheckStatus = Literal["ready", "blocked", "warning", "unknown"]
Severity = Literal["blocking", "warning", "info"]

CHECK_PROJECT = "project"
CHECK_PLANNER = "planner"
CHECK_WORKFLOW = "workflow"
CHECK_TASKS = "tasks"
CHECK_NODES = "nodes"
CHECK_CREDENTIALS = "credentials"
CHECK_ORDER = (
    CHECK_PROJECT,
    CHECK_PLANNER,
    CHECK_WORKFLOW,
    CHECK_TASKS,
    CHECK_NODES,
    CHECK_CREDENTIALS,
)

ACTION_OPEN_PROJECT = "open_project"
ACTION_OPEN_PLANNER = "open_planner"
ACTION_OPEN_NODES = "open_nodes"
ACTION_OPEN_WORKFLOW = "open_workflow"
ACTION_RETRY = "retry"


def _issue(
    code: str,
    severity: Severity,
    title: str,
    message: str,
    action: str,
    target_id: str | None = None,
) -> dict[str, Any]:
    return {
        "code": code,
        "severity": severity,
        "title": title,
        "message": message,
        "action": action,
        "targetId": target_id,
    }


class ReadinessService:
    def __init__(self, services: Services) -> None:
        self._services = services

    async def check(
        self,
        project_id: str | None = None,
        workflow_id: str | None = None,
        mode: ReadinessMode = "local",
    ) -> dict[str, Any]:
        services = self._services
        checks: dict[str, CheckStatus] = {key: "unknown" for key in CHECK_ORDER}
        issues: list[dict[str, Any]] = []

        project = None
        if project_id is not None:
            project = services.projects.get(project_id)
            if project is None:
                checks[CHECK_PROJECT] = "blocked"
                issues.append(_issue(
                    "project_missing", "blocking", "项目不存在",
                    "所选项目已被删除或不可用，请重新选择项目。",
                    ACTION_OPEN_PROJECT, project_id,
                ))
            elif not Path(project.root_path).is_dir():
                checks[CHECK_PROJECT] = "blocked"
                issues.append(_issue(
                    "project_root_missing", "blocking", "项目目录不可用",
                    "项目目录不存在或不可写，请重新选择项目目录。",
                    ACTION_OPEN_PROJECT, project.id,
                ))
            else:
                checks[CHECK_PROJECT] = "ready"
        elif not services.projects.list():
            checks[CHECK_PROJECT] = "blocked"
            issues.append(_issue(
                "project_missing", "blocking", "尚未创建项目",
                "请先创建一个项目并选择项目目录。",
                ACTION_OPEN_PROJECT,
            ))
        else:
            checks[CHECK_PROJECT] = "ready"

        planner_config = services.app_config.get("planner")
        if services.planner is None and planner_config is None:
            checks[CHECK_PLANNER] = "blocked"
            issues.append(_issue(
                "planner_not_configured", "blocking", "规划器未配置",
                "请在“设置”中填写 Planner 的 Base URL、模型和 API Key。",
                ACTION_OPEN_PLANNER,
            ))
        elif planner_config is not None and services.credentials.get(planner_config["credential_key"]) is None:
            checks[CHECK_PLANNER] = "blocked"
            issues.append(_issue(
                "planner_credential_missing", "blocking", "规划器凭据缺失",
                "Planner 的 API Key 未保存或已丢失，请在“设置”中重新填写。",
                ACTION_OPEN_PLANNER,
            ))
        else:
            checks[CHECK_PLANNER] = "ready"

        workflow: Workflow | None = None
        if workflow_id is not None:
            workflow = services.workflows.get(workflow_id)
            if workflow is None:
                checks[CHECK_WORKFLOW] = "blocked"
                issues.append(_issue(
                    "workflow_missing", "blocking", "工作流不存在",
                    "所选工作流已被删除，请重新规划。",
                    ACTION_OPEN_WORKFLOW, workflow_id,
                ))
        elif project is not None:
            workflow = services.workflows.get_active(project.id)
        if workflow is not None:
            if workflow.status is WorkflowStatus.REVIEWED:
                checks[CHECK_WORKFLOW] = "ready"
            else:
                checks[CHECK_WORKFLOW] = "blocked"
                issues.append(_issue(
                    "workflow_not_reviewed", "blocking", "工作流未审核",
                    "工作流尚未通过审核，请先在审核页确认快照。",
                    ACTION_OPEN_WORKFLOW, workflow.id,
                ))
        elif project is not None and checks[CHECK_WORKFLOW] == "unknown":
            checks[CHECK_WORKFLOW] = "blocked"
            issues.append(_issue(
                "workflow_missing", "blocking", "尚未生成工作流",
                "请先输入目标并生成工作流程。",
                ACTION_OPEN_WORKFLOW,
            ))

        nodes = services.nodes.list()
        online = [node for node in nodes if node.status is NodeStatus.ONLINE]
        if not nodes:
            checks[CHECK_NODES] = "blocked"
            issues.append(_issue(
                "node_missing", "blocking", "尚未配置执行节点",
                "请添加本机节点或远程节点。",
                ACTION_OPEN_NODES,
            ))
        elif not online:
            checks[CHECK_NODES] = "blocked"
            issues.append(_issue(
                "node_offline", "blocking", "没有在线节点",
                "所有节点均离线，请诊断或重新部署节点。",
                ACTION_OPEN_NODES,
            ))
        else:
            checks[CHECK_NODES] = "ready"

        if workflow is not None:
            if not workflow.tasks:
                checks[CHECK_TASKS] = "blocked"
                issues.append(_issue(
                    "workflow_empty", "blocking", "工作流没有任务",
                    "请重新规划或为工作流添加任务。",
                    ACTION_OPEN_WORKFLOW, workflow.id,
                ))
            else:
                unmatched = [
                    task for task in workflow.tasks
                    if not self._matching_nodes(task, nodes)
                ]
                if unmatched:
                    checks[CHECK_TASKS] = "blocked"
                    for task in unmatched[:5]:
                        issues.append(_issue(
                            "task_without_matching_node", "blocking",
                            f"任务“{task.title}”没有可用节点",
                            "没有在线节点满足该任务的模型/工具/标签要求，请调整任务要求或节点能力。",
                            ACTION_OPEN_NODES, task.id,
                        ))
                else:
                    checks[CHECK_TASKS] = "ready"

        missing_credentials = [
            node for node in nodes
            if services.credentials.get(services.node_credential_key(node.id)) is None
        ]
        if nodes and missing_credentials:
            checks[CHECK_CREDENTIALS] = "blocked"
            for node in missing_credentials[:5]:
                issues.append(_issue(
                    "node_credential_missing", "blocking",
                    f"节点“{node.name}”缺少访问令牌",
                    "该节点的 Node Token 未保存，请在节点设置中重新填写。",
                    ACTION_OPEN_NODES, node.id,
                ))
        elif nodes:
            checks[CHECK_CREDENTIALS] = "ready"

        if mode == "deep" and checks[CHECK_NODES] == "ready":
            await self._deep_node_check(online, checks, issues)

        ready = not any(issue["severity"] == "blocking" for issue in issues)
        return {
            "ready": ready,
            "checkedAt": datetime.now(timezone.utc).isoformat(),
            "projectId": project.id if project else project_id,
            "workflowId": workflow.id if workflow else workflow_id,
            "checks": checks,
            "issues": issues,
        }

    @staticmethod
    def _matching_nodes(task: Task, nodes: list[HermesNode]) -> list[HermesNode]:
        policy = task.execution_policy
        candidates = [
            node for node in nodes
            if node.status is NodeStatus.ONLINE and supports_task(node, task)
        ]
        if policy.mode == "fixed":
            candidates = [node for node in candidates if node.id == policy.node_id]
        elif policy.mode == "node_group":
            from xuanji.nodes.registry import supports_group

            candidates = [node for node in candidates if supports_group(node, policy.node_group)]
        return candidates

    async def _deep_node_check(
        self,
        online: list[HermesNode],
        checks: dict[str, CheckStatus],
        issues: list[dict[str, Any]],
    ) -> None:
        services = self._services
        for node in online:
            client = services.node_clients.get(node.id)
            if client is None:
                checks[CHECK_NODES] = "warning"
                issues.append(_issue(
                    "node_client_unavailable", "warning",
                    f"节点“{node.name}”客户端不可用",
                    "节点客户端尚未建立连接，请重新保存节点配置或诊断。",
                    ACTION_OPEN_NODES, node.id,
                ))
                continue
            try:
                await client.health()
            except Exception:
                checks[CHECK_NODES] = "warning"
                issues.append(_issue(
                    "node_unreachable", "warning",
                    f"节点“{node.name}”健康检查失败",
                    "深度检查发现节点无法访问，请诊断节点连接。",
                    ACTION_OPEN_NODES, node.id,
                ))
