from __future__ import annotations

import asyncio
import inspect
import hmac
from collections.abc import AsyncIterator, Callable, Coroutine, Mapping
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Protocol

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from xuanji.artifacts.manager import ArtifactManager
from xuanji.credentials import (
    CredentialStore,
    KeychainCredentialStore,
    LocalCredentialStore,
    migrate_credentials,
)
from xuanji.domain.enums import RunStatus
from xuanji.domain.models import HermesNode
from xuanji.execution import ExecutionManager, RecoveryService
from xuanji.nodes import NodeClient, SshTunnelProvider, TunnelProvider
from xuanji.planner.providers import OpenAIChatCompletionsProvider
from xuanji.planner.service import PlannerService
from xuanji.provisioning import ProvisioningService
from xuanji.provisioning.ssh import app_known_hosts_path, ensure_known_hosts_file
from xuanji.readiness import ReadinessService
from xuanji.session_tickets import SessionTicketStore
from xuanji.storage.database import Database
from xuanji.storage.repositories import (
    ArtifactRepository,
    ConfigRepository,
    EventRepository,
    NodeRepository,
    ProjectRepository,
    RunRepository,
    WorkflowRepository,
)

from .errors import install_error_handlers


class Planner(Protocol):
    async def plan(self, project_id: str, goal: str, context: str, constraints: dict): ...


PlannerFactory = Callable[[dict[str, str], CredentialStore], Planner]
NodeClientFactory = Callable[[str, str], NodeClient]


@dataclass(frozen=True)
class CoordinatorConfig:
    data_dir: Path
    poll_interval: float = 1.0
    session_token: str | None = None
    credential_backend: str = "file"

    @property
    def db_path(self) -> Path:
        return self.data_dir / "coordinator.db"

    @property
    def projects_dir(self) -> Path:
        return self.data_dir / "projects"

    @property
    def credentials_path(self) -> Path:
        return self.data_dir / "credentials.json"

    @property
    def known_hosts_path(self) -> Path:
        return app_known_hosts_path(self.data_dir)


@dataclass
class Services:
    config: CoordinatorConfig
    database: Database
    credentials: CredentialStore
    planner: Planner | None
    planner_factory: PlannerFactory
    artifacts: ArtifactManager
    execution: ExecutionManager
    recovery: RecoveryService
    provisioning: ProvisioningService
    projects: ProjectRepository
    workflows: WorkflowRepository
    runs: RunRepository
    nodes: NodeRepository
    artifact_repository: ArtifactRepository
    events: EventRepository
    app_config: ConfigRepository
    node_clients: dict[str, NodeClient]
    node_client_factory: NodeClientFactory
    thinking_models: Any | None = None
    readiness: ReadinessService | None = None
    session_tickets: SessionTicketStore = field(default_factory=SessionTicketStore)
    background_tasks: set[asyncio.Task[Any]] = field(default_factory=set)

    @staticmethod
    def node_credential_key(node_id: str) -> str:
        return f"node.{node_id}.token"

    async def install_node_client(self, node: HermesNode, credential: str | None = None) -> bool:
        token = credential
        if token is None:
            token = self.credentials.get(self.node_credential_key(node.id))
        if not token:
            await self.remove_node_client(node.id)
            return False
        replacement = self.node_client_factory(str(node.api_url), token)
        previous = self.node_clients.get(node.id)
        self.node_clients[node.id] = replacement
        self.execution.node_clients[node.id] = replacement
        if previous is not None and previous is not replacement:
            await _close(previous)
        return True

    async def remove_node_client(self, node_id: str) -> None:
        previous = self.node_clients.pop(node_id, None)
        self.execution.node_clients.pop(node_id, None)
        if previous is not None:
            await _close(previous)

    async def rebuild_node_clients(self) -> None:
        for node in self.nodes.list():
            await self.install_node_client(node)

    async def close_node_clients(self) -> None:
        for node_id in list(self.node_clients):
            await self.remove_node_client(node_id)

    def spawn_run_task(
        self,
        run_id: str,
        operation: str,
        coroutine: Coroutine[Any, Any, Any],
    ) -> None:
        task = asyncio.create_task(coroutine)
        self.background_tasks.add(task)

        def completed(done: asyncio.Task[Any]) -> None:
            self.background_tasks.discard(done)
            if done.cancelled():
                return
            error = done.exception()
            if error is None:
                return
            run = self.runs.get(run_id)
            if run is not None and run.status not in {
                RunStatus.CANCELLED,
                RunStatus.SUCCESS,
                RunStatus.FAILED,
            }:
                run.status = RunStatus.FAILED
                run.completed_at = datetime.now(timezone.utc)
                self.runs.update(run)
            self.events.append(
                run_id,
                "run.background_failed",
                {
                    "code": "background_task_failed",
                    "operation": operation,
                    "run_id": run_id,
                },
            )

        task.add_done_callback(completed)

    async def drain_background_tasks(self) -> None:
        tasks = list(self.background_tasks)
        for task in tasks:
            task.cancel()
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=True)
        self.background_tasks.clear()


async def _close(resource: Any) -> None:
    result = resource.close()
    if inspect.isawaitable(result):
        await result


def _default_planner_factory(
    config: dict[str, str],
    credentials: CredentialStore,
) -> Planner:
    provider = OpenAIChatCompletionsProvider(
        base_url=config["base_url"],
        credential_store=credentials,
        credential_key=config["credential_key"],
    )
    return PlannerService(provider, model=config["model"], provider_name="openai-compatible")


def create_coordinator_app(
    config: CoordinatorConfig,
    *,
    planner: PlannerService | Planner | None = None,
    planner_factory: PlannerFactory | None = None,
    node_clients: Mapping[str, NodeClient] | None = None,
    node_client_factory: NodeClientFactory | None = None,
    execution: ExecutionManager | None = None,
    recovery: RecoveryService | None = None,
    provisioning: ProvisioningService | None = None,
    tunnels: TunnelProvider | None = None,
) -> FastAPI:
    build_planner = planner_factory or _default_planner_factory
    build_node_client = node_client_factory or (lambda base_url, token: NodeClient(base_url, token))

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        config.data_dir.mkdir(parents=True, exist_ok=True)
        config.projects_dir.mkdir(parents=True, exist_ok=True)
        ensure_known_hosts_file(config.known_hosts_path)
        database = Database(config.db_path)
        database.migrate()
        if config.credential_backend in {"auto", "keychain"} and KeychainCredentialStore.available():
            keychain = KeychainCredentialStore()
            migrate_credentials(LocalCredentialStore(config.credentials_path), keychain)
            credentials: CredentialStore = keychain
        else:
            credentials = LocalCredentialStore(config.credentials_path)
        artifacts = ArtifactManager(config.projects_dir)
        clients = dict(node_clients or {})
        tunnel_provider = tunnels or SshTunnelProvider(known_hosts_path=config.known_hosts_path)
        manager = execution or ExecutionManager(
            database,
            artifacts,
            clients,
            poll_interval=config.poll_interval,
            tunnels=tunnel_provider,
        )
        if hasattr(manager, "node_clients"):
            manager.node_clients = clients
        if tunnels is not None and hasattr(manager, "tunnels"):
            manager.tunnels = tunnels
        elif (
            execution is not None
            and tunnels is None
            and hasattr(manager, "tunnels")
            and not isinstance(getattr(manager, "tunnels"), SshTunnelProvider)
        ):
            # Inject real SSH tunnels when a prebuilt ExecutionManager used the default Noop.
            manager.tunnels = tunnel_provider
        recovery_service = recovery or RecoveryService(manager)
        projects = ProjectRepository(database)
        config_repository = ConfigRepository(database)
        planner_config = config_repository.get("planner")
        active_planner = planner or (
            build_planner(planner_config, credentials) if planner_config is not None else None
        )
        services = Services(
            config=config,
            database=database,
            credentials=credentials,
            planner=active_planner,
            planner_factory=build_planner,
            artifacts=artifacts,
            execution=manager,
            recovery=recovery_service,
            provisioning=provisioning
            or ProvisioningService(known_hosts_path=config.known_hosts_path),
            projects=projects,
            workflows=WorkflowRepository(database),
            runs=RunRepository(database),
            nodes=NodeRepository(database),
            artifact_repository=ArtifactRepository(database),
            events=EventRepository(database),
            app_config=config_repository,
            node_clients=clients,
            node_client_factory=build_node_client,
        )
        from xuanji.thinking_models import ThinkingModelRepository, ThinkingModelService

        services.thinking_models = ThinkingModelService(
            ThinkingModelRepository(database),
            config_repository,
            credentials,
            config.db_path,
        )
        services.thinking_models.migrate_legacy()
        services.readiness = ReadinessService(services)
        app.state.services = services
        try:
            for project in projects.list():
                artifacts.register_project(project)
            if node_clients is None:
                await services.rebuild_node_clients()
            await recovery_service.recover_all()
            yield
        finally:
            await services.drain_background_tasks()
            await manager.close()
            await services.close_node_clients()
            database.close()

    app = FastAPI(title="璇玑 Coordinator", version="3.0.0", lifespan=lifespan)

    @app.middleware("http")
    async def require_desktop_session(request: Request, call_next):
        token = config.session_token
        if token and request.url.path != "/api/status":
            supplied = request.headers.get("X-Xuanji-Session", "")
            if not hmac.compare_digest(supplied, token):
                return JSONResponse(
                    status_code=401,
                    content={
                        "error": {
                            "code": "invalid_session",
                            "message": "桌面会话已失效，请重新启动应用",
                            "details": {},
                        }
                    },
                )
        return await call_next(request)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["tauri://localhost", "http://tauri.localhost"],
        allow_origin_regex=r"^http://(?:localhost|127\.0\.0\.1)(?::\d+)?$",
        allow_methods=["*"],
        allow_headers=["*"],
    )
    install_error_handlers(app)

    from .artifacts import router as artifacts_router
    from .events import router as events_router
    from .nodes import router as nodes_router
    from .planner import router as planner_router
    from .projects import router as projects_router
    from .readiness import router as readiness_router
    from .runs import router as runs_router
    from .session import router as session_router
    from .thinking_models import router as thinking_models_router
    from .diagnostics import router as diagnostics_router
    from .recovery import router as recovery_router
    from .workflows import router as workflows_router

    for router in (
        projects_router,
        workflows_router,
        runs_router,
        nodes_router,
        planner_router,
        thinking_models_router,
        diagnostics_router,
        recovery_router,
        artifacts_router,
        events_router,
        readiness_router,
        session_router,
    ):
        app.include_router(router)

    @app.get("/api/status")
    async def status() -> dict[str, str]:
        return {"status": "ok", "version": "3.0.0"}

    return app


def get_default_app() -> FastAPI:
    return create_coordinator_app(CoordinatorConfig(Path.home() / ".xuanji"))


app = get_default_app()
