from __future__ import annotations

import json
import os
import tempfile
from pathlib import Path


class LocalCredentialStore:
    """Small local credential file with user-only filesystem permissions."""

    def __init__(self, path: Path):
        self._path = path

    def get(self, key: str) -> str | None:
        return self._read().get(key)

    def set(self, key: str, value: str) -> None:
        credentials = self._read()
        credentials[key] = value
        self._write(credentials)

    def delete(self, key: str) -> None:
        credentials = self._read()
        if key not in credentials:
            return
        del credentials[key]
        self._write(credentials)

    def _read(self) -> dict[str, str]:
        if not self._path.exists():
            return {}
        try:
            payload = json.loads(self._path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError, UnicodeDecodeError) as error:
            raise RuntimeError("本地凭据配置读取失败") from error
        if not isinstance(payload, dict) or not all(
            isinstance(key, str) and isinstance(value, str)
            for key, value in payload.items()
        ):
            raise RuntimeError("本地凭据配置格式无效")
        return payload

    def _write(self, credentials: dict[str, str]) -> None:
        self._path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self._path.parent, 0o700)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{self._path.name}.",
            dir=self._path.parent,
            text=True,
        )
        temporary_path = Path(temporary_name)
        try:
            with os.fdopen(descriptor, "w", encoding="utf-8") as file:
                json.dump(credentials, file, ensure_ascii=False, indent=2, sort_keys=True)
                file.write("\n")
                file.flush()
                os.fsync(file.fileno())
            os.chmod(temporary_path, 0o600)
            os.replace(temporary_path, self._path)
            os.chmod(self._path, 0o600)
        finally:
            temporary_path.unlink(missing_ok=True)
