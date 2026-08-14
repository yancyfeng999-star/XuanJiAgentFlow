from __future__ import annotations

import logging
import sqlite3
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from pydantic import ValidationError

from xuanji.artifacts.manager import UnsafePathError
from xuanji.nodes import NodeClientError
from xuanji.planner.providers import PlannerError

logger = logging.getLogger(__name__)

ERROR_MESSAGES: dict[str, str] = {
    "artifact_integrity_error": "产物完整性校验失败",
    "artifact_not_found": "产物不存在",
    "artifact_verification_failed": "产物校验失败",
    "background_task_failed": "后台执行任务失败",
    "cancel_failed": "取消任务失败",
    "desktop_session_required": "桌面会话已失效，请重新启动应用",
    "host_key_unconfirmed": "尚未确认远程主机指纹",
    "integrity_conflict": "该资源与现有数据冲突",
    "internal_error": "服务器内部错误",
    "invalid_project_root": "项目目录无效",
    "invalid_session": "桌面会话已失效，请重新启动应用",
    "node_client_unavailable": "节点客户端当前不可用",
    "node_connection_error": "无法连接执行节点",
    "node_not_found": "执行节点不存在",
    "node_not_remote": "该节点未配置远程连接信息",
    "node_protocol_error": "执行节点返回了无效响应",
    "node_timeout": "执行节点请求超时",
    "no_eligible_node": "没有符合调度条件的可用节点",
    "planner_credentials_missing": "思考模型接口密钥尚未配置",
    "planner_invalid_output": "思考模型返回的工作流格式无效，自动修复后仍未通过校验",
    "planner_not_configured": "思考模型尚未配置，请先前往“思考模型”完成配置",
    "planner_provider_error": "思考模型服务请求失败",
    "planner_timeout": "思考模型服务请求超时",
    "planner_unauthorized": "思考模型身份验证失败，请检查接口密钥",
    "project_not_found": "项目不存在",
    "request_validation_error": "请求参数校验失败",
    "resource_in_use": "该资源仍被历史记录引用，无法删除",
    "resource_not_found": "资源不存在",
    "run_not_found": "运行记录不存在",
    "run_not_cancellable": "当前运行不能取消",
    "run_not_pausable": "当前运行不能暂停",
    "run_not_resumable": "当前运行不能恢复",
    "ssh_not_configured": "节点尚未配置远程连接信息",
    "task_not_found": "任务不存在",
    "task_not_retryable": "当前任务不可重试",
    "task_not_skippable": "当前任务不可跳过",
    "task_timeout": "任务执行超时",
    "tunnel_open_failed": "远程连接通道建立失败",
    "validation_error": "数据校验失败",
    "workflow_frozen": "工作流已审核冻结，不能继续编辑",
    "workflow_invalid": "工作流结构校验失败",
    "workflow_not_found": "工作流不存在",
    "workflow_not_reviewed": "工作流必须先审核，才能开始执行",
}


class APIError(Exception):
    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: dict[str, Any] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or {}


def _details(details: Any | None) -> dict[str, Any]:
    if details is None:
        return {}
    if isinstance(details, dict):
        return details
    return {"errors": details}


def error_payload(code: str, message: str, details: Any | None = None) -> dict[str, Any]:
    return {
        "error": {
            "code": code,
            "message": localized_error_message(code, message),
            "details": _details(details),
        }
    }


def localized_error_message(code: str, message: str | None = None) -> str:
    configured = ERROR_MESSAGES.get(code)
    if configured:
        return configured
    fallback = (message or "").strip()
    if any("\u4e00" <= character <= "\u9fff" for character in fallback):
        return fallback
    return f"操作失败（错误码：{code}）"


def _validation_message(error: dict[str, Any]) -> str:
    error_type = str(error.get("type", ""))
    context_error = error.get("ctx", {}).get("error") if isinstance(error.get("ctx"), dict) else None
    if context_error:
        context_message = str(context_error)
        if any("\u4e00" <= character <= "\u9fff" for character in context_message):
            return context_message
    messages = {
        "missing": "必填字段不能为空",
        "extra_forbidden": "包含不允许的额外字段",
        "string_too_short": "文本长度不足",
        "string_too_long": "文本长度超出限制",
        "string_pattern_mismatch": "字段格式不正确",
        "url_parsing": "URL 格式无效",
        "greater_than_equal": "数值低于允许的最小值",
        "less_than_equal": "数值超过允许的最大值",
        "int_parsing": "请输入有效整数",
        "float_parsing": "请输入有效数字",
        "bool_parsing": "请输入有效布尔值",
        "value_error": "字段值无效",
    }
    return messages.get(error_type, "字段校验失败")


def safe_validation_errors(errors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    sanitized: list[dict[str, Any]] = []
    for error in errors:
        item: dict[str, Any] = {}
        for key in ("loc", "type"):
            if key in error:
                item[key] = error[key]
        item["msg"] = _validation_message(error)
        sanitized.append(item)
    return sanitized


def install_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(APIError)
    async def api_error(_: Request, error: APIError) -> JSONResponse:
        return JSONResponse(
            status_code=error.status_code,
            content=jsonable_encoder(error_payload(error.code, error.message, error.details)),
        )

    @app.exception_handler(RequestValidationError)
    async def request_validation(_: Request, error: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(
                error_payload(
                    "validation_error",
                    "请求参数校验失败",
                    safe_validation_errors(error.errors()),
                )
            ),
        )

    @app.exception_handler(ValidationError)
    async def model_validation(_: Request, error: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(
                error_payload(
                    "validation_error",
                    "数据校验失败",
                    safe_validation_errors(error.errors()),
                )
            ),
        )

    @app.exception_handler(PlannerError)
    async def planner_error(_: Request, error: PlannerError) -> JSONResponse:
        return JSONResponse(status_code=502, content=error_payload(error.code, str(error)))

    @app.exception_handler(NodeClientError)
    async def node_error(_: Request, error: NodeClientError) -> JSONResponse:
        return JSONResponse(status_code=502, content=error_payload(error.code, str(error)))

    @app.exception_handler(UnsafePathError)
    async def unsafe_path(_: Request, error: UnsafePathError) -> JSONResponse:
        # Path traversal during artifact resolve → 404; other root/layout issues
        # should still surface a stable non-secret error without pretending "artifact".
        message = str(error)
        if "project root" in message.lower():
            return JSONResponse(
                status_code=400,
                content=error_payload("invalid_project_root", message),
            )
        return JSONResponse(
            status_code=404,
            content=error_payload("artifact_not_found", "产物不存在"),
        )

    @app.exception_handler(sqlite3.IntegrityError)
    async def integrity_error(request: Request, _: sqlite3.IntegrityError) -> JSONResponse:
        resource = "resource"
        resource_id = "unknown"
        path = request.url.path.rstrip("/").split("/")
        if len(path) >= 2 and path[-2] in {"projects", "nodes"}:
            resource = path[-2][:-1]
            resource_id = path[-1]
            code = "resource_in_use"
            message = "该资源仍被历史记录引用，无法删除"
        else:
            code = "integrity_conflict"
            message = "该资源与现有数据冲突"
        return JSONResponse(
            status_code=409,
            content=error_payload(
                code,
                message,
                {"resource": resource, "id": resource_id},
            ),
        )

    @app.exception_handler(KeyError)
    async def key_error(_: Request, __: KeyError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content=error_payload("resource_not_found", "资源不存在"),
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, error: Exception) -> JSONResponse:
        logger.exception("Unhandled API error", exc_info=error)
        return JSONResponse(
            status_code=500,
            content=error_payload("internal_error", "服务器内部错误"),
        )
