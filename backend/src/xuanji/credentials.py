from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Protocol


class CredentialStore(Protocol):
    def get(self, key: str) -> str | None: ...
    def set(self, key: str, value: str) -> None: ...
    def delete(self, key: str) -> None: ...


class InMemoryCredentialStore:
    def __init__(self) -> None:
        self._values: dict[str, str] = {}

    def get(self, key: str) -> str | None:
        return self._values.get(key)

    def set(self, key: str, value: str) -> None:
        self._values[key] = value

    def delete(self, key: str) -> None:
        self._values.pop(key, None)


class KeychainCredentialStore:
    """macOS Keychain backend via the `security` CLI (testable via injected runner)."""

    def __init__(self, service: str = "app.xuanji.coordinator", runner=subprocess.run):
        self._service = service
        self._run = runner

    @staticmethod
    def available() -> bool:
        return sys.platform == "darwin" and shutil.which("security") is not None

    def get(self, key: str) -> str | None:
        result = self._run(
            ["/usr/bin/security", "find-generic-password", "-s", self._service, "-a", key, "-w"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            return None
        return result.stdout.rstrip("\n")

    def set(self, key: str, value: str) -> None:
        result = self._run(
            ["/usr/bin/security", "add-generic-password", "-U", "-s", self._service, "-a", key, "-w", value],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode != 0:
            raise RuntimeError(f"Keychain 写入失败：{result.stderr.strip() or result.returncode}")

    def delete(self, key: str) -> None:
        self._run(
            ["/usr/bin/security", "delete-generic-password", "-s", self._service, "-a", key],
            capture_output=True,
            text=True,
            timeout=10,
        )


def migrate_credentials(source: "LocalCredentialStore", target: CredentialStore) -> dict:
    """Copy all secrets to target, verify read-back, then remove the old file atomically.

    On any failure the source file is preserved and migrated=False is returned.
    """
    report = {"migrated": False, "migrated_keys": 0, "error": None}
    try:
        values = source._read()
    except RuntimeError as error:
        report["error"] = str(error)
        return report
    if not values:
        report["migrated"] = True
        source._path.unlink(missing_ok=True)
        return report
    try:
        for key, value in values.items():
            target.set(key, value)
        for key, value in values.items():
            if target.get(key) != value:
                report["error"] = f"凭据 {key} 写入后无法读回校验"
                return report
    except Exception as error:
        report["error"] = str(error)
        return report
    backup = source._path.with_suffix(source._path.suffix + ".migrated")
    os.replace(source._path, backup)
    os.chmod(backup, 0o600)
    report["migrated"] = True
    report["migrated_keys"] = len(values)
    return report


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
