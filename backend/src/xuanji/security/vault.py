import base64
import json
import os
import secrets
import tempfile
from pathlib import Path
from typing import Literal

from argon2.exceptions import HashingError
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from pydantic import ValidationError

from xuanji.security.kdf import DEFAULT_KDF_PARAMETERS, derive_key
from xuanji.security.models import KDFParameters, VaultDocument


_AUTHENTICATION_ERROR = "invalid password or corrupted vault"
_LOCKED_ERROR = "credential vault is locked"
_ASSOCIATED_DATA = b"xuanji-credential-vault-v1"


class VaultError(Exception):
    pass


class VaultAuthenticationError(VaultError):
    pass


class VaultLockedError(VaultError):
    pass


class CredentialVault:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._key: bytes | None = None
        self._credentials: dict[str, str] | None = None
        self._salt: bytes | None = None
        self._kdf: KDFParameters | None = None

    @property
    def status(self) -> Literal["uninitialized", "locked", "unlocked"]:
        if self._key is not None:
            return "unlocked"
        if self.path.exists():
            return "locked"
        return "uninitialized"

    def initialize(self, password: str) -> None:
        if self.path.exists():
            raise VaultError("credential vault is already initialized")

        salt = secrets.token_bytes(16)
        parameters = DEFAULT_KDF_PARAMETERS.model_copy()
        key = derive_key(password, salt, parameters)
        self._key = key
        self._credentials = {}
        self._salt = salt
        self._kdf = parameters
        try:
            self._persist()
        except Exception:
            self.lock()
            raise

    def unlock(self, password: str) -> None:
        self.lock()
        try:
            document = VaultDocument.model_validate_json(self.path.read_bytes())
            salt = base64.b64decode(document.salt, validate=True)
            nonce = base64.b64decode(document.nonce, validate=True)
            ciphertext = base64.b64decode(document.ciphertext, validate=True)
            key = derive_key(password, salt, document.kdf)
            plaintext = AESGCM(key).decrypt(nonce, ciphertext, _ASSOCIATED_DATA)
            credentials = json.loads(plaintext)
            if not isinstance(credentials, dict) or not all(
                isinstance(key, str) and isinstance(value, str)
                for key, value in credentials.items()
            ):
                raise ValueError("invalid credential payload")
        except (
            HashingError,
            InvalidTag,
            OSError,
            ValidationError,
            ValueError,
            TypeError,
        ):
            self.lock()
            raise VaultAuthenticationError(_AUTHENTICATION_ERROR) from None

        self._key = key
        self._credentials = credentials
        self._salt = salt
        self._kdf = document.kdf

    def lock(self) -> None:
        self._key = None
        self._credentials = None
        self._salt = None
        self._kdf = None

    def set(self, key: str, value: str) -> None:
        credentials = self._require_unlocked()
        previous = credentials.get(key)
        existed = key in credentials
        credentials[key] = value
        try:
            self._persist()
        except Exception:
            if existed:
                credentials[key] = previous  # type: ignore[assignment]
            else:
                credentials.pop(key, None)
            raise

    def get(self, key: str) -> str | None:
        return self._require_unlocked().get(key)

    def delete(self, key: str) -> bool:
        credentials = self._require_unlocked()
        if key not in credentials:
            return False
        previous = credentials.pop(key)
        try:
            self._persist()
        except Exception:
            credentials[key] = previous
            raise
        return True

    def _require_unlocked(self) -> dict[str, str]:
        if self._key is None or self._credentials is None:
            raise VaultLockedError(_LOCKED_ERROR)
        return self._credentials

    def _persist(self) -> None:
        credentials = self._require_unlocked()
        if self._salt is None or self._kdf is None or self._key is None:
            raise VaultLockedError(_LOCKED_ERROR)

        nonce = secrets.token_bytes(12)
        plaintext = json.dumps(
            credentials,
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
        ciphertext = AESGCM(self._key).encrypt(nonce, plaintext, _ASSOCIATED_DATA)
        document = VaultDocument(
            kdf=self._kdf,
            salt=base64.b64encode(self._salt).decode("ascii"),
            nonce=base64.b64encode(nonce).decode("ascii"),
            ciphertext=base64.b64encode(ciphertext).decode("ascii"),
        )
        self._atomic_write(document.model_dump_json().encode("utf-8"))

    def _atomic_write(self, data: bytes) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                dir=self.path.parent,
                prefix=f".{self.path.name}.",
                suffix=".tmp",
                delete=False,
            ) as temporary_file:
                temporary_path = Path(temporary_file.name)
                temporary_file.write(data)
                temporary_file.flush()
                os.fsync(temporary_file.fileno())
            os.replace(temporary_path, self.path)
        finally:
            if temporary_path is not None:
                temporary_path.unlink(missing_ok=True)
