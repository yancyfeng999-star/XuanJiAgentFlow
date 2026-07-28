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
from xuanji.security import VaultAuthenticationError, VaultError, VaultLockedError

logger = logging.getLogger(__name__)


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
            "message": message,
            "details": _details(details),
        }
    }


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
                error_payload("validation_error", "request validation failed", error.errors())
            ),
        )

    @app.exception_handler(ValidationError)
    async def model_validation(_: Request, error: ValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=jsonable_encoder(
                error_payload("validation_error", "data validation failed", error.errors())
            ),
        )

    @app.exception_handler(PlannerError)
    async def planner_error(_: Request, error: PlannerError) -> JSONResponse:
        return JSONResponse(status_code=502, content=error_payload(error.code, str(error)))

    @app.exception_handler(NodeClientError)
    async def node_error(_: Request, error: NodeClientError) -> JSONResponse:
        return JSONResponse(status_code=502, content=error_payload(error.code, str(error)))

    @app.exception_handler(VaultLockedError)
    async def vault_locked(_: Request, error: VaultLockedError) -> JSONResponse:
        return JSONResponse(status_code=423, content=error_payload("vault_locked", str(error)))

    @app.exception_handler(VaultAuthenticationError)
    async def vault_authentication(_: Request, error: VaultAuthenticationError) -> JSONResponse:
        return JSONResponse(
            status_code=401,
            content=error_payload("vault_authentication_failed", str(error)),
        )

    @app.exception_handler(VaultError)
    async def vault_error(_: Request, error: VaultError) -> JSONResponse:
        return JSONResponse(status_code=409, content=error_payload("vault_error", str(error)))

    @app.exception_handler(UnsafePathError)
    async def unsafe_path(_: Request, __: UnsafePathError) -> JSONResponse:
        return JSONResponse(
            status_code=404,
            content=error_payload("artifact_not_found", "artifact not found"),
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
            message = f"{resource} is referenced by historical records"
        else:
            code = "integrity_conflict"
            message = "resource conflicts with existing data"
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
            content=error_payload("resource_not_found", "resource not found"),
        )

    @app.exception_handler(Exception)
    async def unhandled(_: Request, error: Exception) -> JSONResponse:
        logger.exception("Unhandled API error", exc_info=error)
        return JSONResponse(
            status_code=500,
            content=error_payload("internal_error", "internal server error"),
        )
