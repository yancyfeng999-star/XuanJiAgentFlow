from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any

from .models import ThinkingModelProfile


class ThinkingModelRepository:
    def __init__(self, database):
        self.database = database

    def list(self) -> list[ThinkingModelProfile]:
        rows = self.database.connection.execute(
            "SELECT * FROM thinking_model_profiles ORDER BY is_default DESC, display_name, id"
        ).fetchall()
        return [self._row(row) for row in rows]

    def get(self, profile_id: str) -> ThinkingModelProfile | None:
        row = self.database.connection.execute(
            "SELECT * FROM thinking_model_profiles WHERE id=?", (profile_id,)
        ).fetchone()
        return self._row(row) if row else None

    def default(self) -> ThinkingModelProfile | None:
        row = self.database.connection.execute(
            "SELECT * FROM thinking_model_profiles WHERE is_default=1 LIMIT 1"
        ).fetchone()
        return self._row(row) if row else None

    def create(self, profile: ThinkingModelProfile) -> ThinkingModelProfile:
        with self.database.transaction() as connection:
            if profile.is_default:
                connection.execute("UPDATE thinking_model_profiles SET is_default=0")
            self._insert(connection, profile)
        return profile

    def update(self, profile: ThinkingModelProfile) -> ThinkingModelProfile:
        with self.database.transaction() as connection:
            if profile.is_default:
                connection.execute("UPDATE thinking_model_profiles SET is_default=0 WHERE id!=?", (profile.id,))
            connection.execute(
                """UPDATE thinking_model_profiles SET display_name=?,provider_kind=?,api_mode=?,base_url=?,
                model_id=?,credential_key=?,enabled=?,is_default=?,reasoning_effort=?,last_test_status=?,
                last_tested_at=? WHERE id=?""",
                self._values(profile)[1:] + (profile.id,),
            )
        return profile

    def delete(self, profile_id: str) -> bool:
        with self.database.transaction() as connection:
            cursor = connection.execute("DELETE FROM thinking_model_profiles WHERE id=?", (profile_id,))
        return cursor.rowcount == 1

    def set_default(self, profile_id: str) -> ThinkingModelProfile:
        with self.database.transaction() as connection:
            connection.execute("UPDATE thinking_model_profiles SET is_default=0")
            cursor = connection.execute(
                "UPDATE thinking_model_profiles SET is_default=1 WHERE id=?", (profile_id,)
            )
            if cursor.rowcount != 1:
                raise KeyError(profile_id)
        profile = self.get(profile_id)
        if profile is None:
            raise KeyError(profile_id)
        return profile

    def _insert(self, connection, profile: ThinkingModelProfile) -> None:
        connection.execute(
            """INSERT INTO thinking_model_profiles(
                id,display_name,provider_kind,api_mode,base_url,model_id,credential_key,
                enabled,is_default,reasoning_effort,last_test_status,last_tested_at
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (profile.id, *self._values(profile)[1:]),
        )

    def _values(self, profile: ThinkingModelProfile) -> tuple[Any, ...]:
        data = profile.model_dump(mode="json")
        return (
            data["id"],
            data["display_name"],
            data["provider_kind"],
            data["api_mode"],
            str(profile.base_url).rstrip("/"),
            data["model_id"],
            data["credential_key"],
            1 if profile.enabled else 0,
            1 if profile.is_default else 0,
            data["reasoning_effort"],
            data["last_test_status"],
            data["last_tested_at"],
        )

    def _row(self, row) -> ThinkingModelProfile:
        payload = dict(row)
        payload["enabled"] = bool(payload["enabled"])
        payload["is_default"] = bool(payload["is_default"])
        return ThinkingModelProfile.model_validate(payload)
