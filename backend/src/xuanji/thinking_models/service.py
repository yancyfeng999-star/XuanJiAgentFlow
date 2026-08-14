from __future__ import annotations

import uuid
from pathlib import Path

from pydantic import HttpUrl

from xuanji.storage.backup import backup_database, verify_backup

from .models import ThinkingModelProfile, ThinkingModelPublic
from .repository import ThinkingModelRepository

MIGRATION_FLAG = "thinking_models_migrated"


class ThinkingModelError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


class ThinkingModelService:
    def __init__(self, repository: ThinkingModelRepository, app_config, credentials, db_path: Path):
        self.repository = repository
        self.app_config = app_config
        self.credentials = credentials
        self.db_path = Path(db_path)

    def public(self, profile: ThinkingModelProfile) -> dict:
        return ThinkingModelPublic(
            **profile.model_dump(mode="json"),
            credential_configured=self.credentials.get(profile.credential_key) is not None,
        ).model_dump(mode="json")

    def list_public(self) -> list[dict]:
        return [self.public(item) for item in self.repository.list()]

    def create(self, payload: dict, credential: str | None) -> dict:
        profile_id = str(uuid.uuid4())
        credential_key = f"thinking-model.{profile_id}.api-key"
        make_default = payload.get("is_default", False) or self.repository.default() is None
        profile = ThinkingModelProfile(
            id=profile_id,
            display_name=payload["display_name"],
            provider_kind=payload.get("provider_kind", "openai"),
            api_mode=payload["api_mode"],
            base_url=payload["base_url"],
            model_id=payload["model_id"],
            credential_key=credential_key,
            enabled=payload.get("enabled", True),
            is_default=make_default,
            reasoning_effort=payload.get("reasoning_effort"),
        )
        if credential:
            self.credentials.set(credential_key, credential)
        created = self.repository.create(profile)
        return self.public(created)

    def update(self, profile_id: str, payload: dict, credential: str | None) -> dict:
        current = self.repository.get(profile_id)
        if current is None:
            raise ThinkingModelError("thinking_model_not_found", "思考模型不存在")
        data = current.model_dump(mode="json")
        data.update({key: value for key, value in payload.items() if value is not None and key != "credential"})
        data["id"] = current.id
        data["credential_key"] = current.credential_key
        updated = ThinkingModelProfile.model_validate(data)
        if credential:
            self.credentials.set(current.credential_key, credential)
        return self.public(self.repository.update(updated))

    def delete(self, profile_id: str) -> None:
        current = self.repository.get(profile_id)
        if current is None:
            raise ThinkingModelError("thinking_model_not_found", "思考模型不存在")
        if current.is_default and any(item.id != profile_id for item in self.repository.list()):
            raise ThinkingModelError("thinking_model_default_conflict", "请先指定新的默认思考模型，再删除当前默认项")
        self.repository.delete(profile_id)
        self.credentials.delete(current.credential_key)

    def set_default(self, profile_id: str) -> dict:
        try:
            return self.public(self.repository.set_default(profile_id))
        except KeyError as error:
            raise ThinkingModelError("thinking_model_not_found", "思考模型不存在") from error

    def migrate_legacy(self) -> bool:
        if self.app_config.get(MIGRATION_FLAG):
            return False
        planner = self.app_config.get("planner")
        if not planner:
            self.app_config.set(MIGRATION_FLAG, {"migrated": True, "created": False})
            return False
        backup_path = self.db_path.with_name("coordinator.pre-thinking-models.bak")
        info = backup_database(self.db_path, backup_path)
        verify_backup(Path(info["dest"]))
        profile = ThinkingModelProfile(
            id="legacy-default",
            display_name="Default thinking model",
            api_mode="chat_completions",
            base_url=HttpUrl(planner["base_url"]),
            model_id=planner["model"],
            credential_key=planner["credential_key"],
            enabled=True,
            is_default=True,
        )
        self.repository.create(profile)
        self.app_config.set(MIGRATION_FLAG, {"migrated": True, "created": True, "profile_id": profile.id})
        return True
