import base64
import json
from pathlib import Path

import pytest

from xuanji.security.vault import (
    CredentialVault,
    VaultAuthenticationError,
    VaultLockedError,
)


def test_initialize_creates_encrypted_unlocked_vault(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)

    assert vault.status == "uninitialized"

    vault.initialize("correct horse battery staple")

    assert vault.status == "unlocked"
    assert path.is_file()
    assert vault.get("missing") is None


def test_wrong_password_has_stable_error_and_keeps_vault_locked(tmp_path):
    path = tmp_path / "credentials.vault"
    CredentialVault(path).initialize("correct password")
    vault = CredentialVault(path)

    with pytest.raises(
        VaultAuthenticationError,
        match="^invalid password or corrupted vault$",
    ):
        vault.unlock("wrong password")

    assert vault.status == "locked"
    assert vault._key is None


def test_tampering_has_same_stable_authentication_error(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.set("planner_api_key", "secret-value")
    vault.lock()

    document = json.loads(path.read_text())
    ciphertext = bytearray(base64.b64decode(document["ciphertext"]))
    ciphertext[0] ^= 1
    document["ciphertext"] = base64.b64encode(ciphertext).decode("ascii")
    path.write_text(json.dumps(document))

    with pytest.raises(
        VaultAuthenticationError,
        match="^invalid password or corrupted vault$",
    ):
        vault.unlock("correct password")

    assert vault.status == "locked"
    assert vault._key is None


def test_invalid_tampered_kdf_parameters_have_stable_authentication_error(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.lock()

    document = json.loads(path.read_text())
    document["kdf"]["memory_cost"] = 0
    path.write_text(json.dumps(document))

    with pytest.raises(
        VaultAuthenticationError,
        match="^invalid password or corrupted vault$",
    ):
        vault.unlock("correct password")

    assert vault.status == "locked"
    assert vault._key is None


def test_short_tampered_salt_has_stable_authentication_error(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.lock()

    document = json.loads(path.read_text())
    document["salt"] = base64.b64encode(b"short").decode("ascii")
    path.write_text(json.dumps(document))

    with pytest.raises(
        VaultAuthenticationError,
        match="^invalid password or corrupted vault$",
    ):
        vault.unlock("correct password")

    assert vault.status == "locked"


def test_failed_update_rolls_back_in_memory_value(tmp_path, monkeypatch):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.set("token", "persisted")

    def failing_write(_data):
        raise OSError("disk full")

    monkeypatch.setattr(vault, "_atomic_write", failing_write)

    with pytest.raises(OSError, match="disk full"):
        vault.set("token", "not-persisted")

    assert vault.get("token") == "persisted"


def test_locked_vault_cannot_read_or_write_credentials(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.set("token", "sensitive-token")
    vault.lock()

    with pytest.raises(VaultLockedError, match="^credential vault is locked$"):
        vault.get("token")
    with pytest.raises(VaultLockedError, match="^credential vault is locked$"):
        vault.set("token", "replacement")


def test_credentials_survive_lock_and_reunlock(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.set("planner_api_key", "secret-value")
    vault.lock()

    assert vault._key is None

    vault.unlock("correct password")

    assert vault.status == "unlocked"
    assert vault.get("planner_api_key") == "secret-value"


def test_file_contains_only_encrypted_payload_and_required_metadata(tmp_path):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    vault.set("account", "alice@example.com")
    vault.set("planner_api_key", "plain-secret-value")

    raw = path.read_text()
    document = json.loads(raw)

    assert set(document) == {"version", "kdf", "salt", "nonce", "ciphertext"}
    assert document["version"] == 1
    assert document["kdf"]["algorithm"] == "argon2id"
    assert document["kdf"]["key_length"] == 32
    assert "alice@example.com" not in raw
    assert "plain-secret-value" not in raw
    assert "correct password" not in raw
    assert len(base64.b64decode(document["salt"])) >= 16
    assert len(base64.b64decode(document["nonce"])) == 12


def test_updates_replace_the_vault_file_atomically(tmp_path, monkeypatch):
    path = tmp_path / "credentials.vault"
    vault = CredentialVault(path)
    vault.initialize("correct password")
    replacements: list[tuple[Path, Path]] = []

    from xuanji.security import vault as vault_module

    real_replace = vault_module.os.replace

    def recording_replace(source, destination):
        replacements.append((Path(source), Path(destination)))
        real_replace(source, destination)

    monkeypatch.setattr(vault_module.os, "replace", recording_replace)

    vault.set("token", "sensitive-token")

    assert len(replacements) == 1
    source, destination = replacements[0]
    assert source.parent == path.parent
    assert destination == path
    assert not source.exists()
