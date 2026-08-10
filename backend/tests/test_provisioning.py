from __future__ import annotations

import subprocess
from pathlib import Path

import pytest

from xuanji.provisioning.ssh import SSHHost, SSHRunner, ProvisioningService, provisioning_succeeded


class FakeSSHRunner(SSHRunner):
    """Test double that records commands instead of executing them."""

    def __init__(self) -> None:
        super().__init__(SSHHost(host="fake"))
        self.commands: list[str] = []
        self.responses: dict[str, tuple[int, str, str]] = {}

    def run(
        self,
        command: str,
        timeout: float = 30,
        *,
        input_text: str | None = None,
    ) -> tuple[int, str, str]:
        self.commands.append(command)
        return self.responses.get(command, (0, "", ""))

    def deploy_node_agent(self, local_package_path: str, remote_dir: str = "~/.xuanji-node") -> dict:
        assert Path(local_package_path).is_file()
        return {"success": True, "output": "installed"}

    def start_node_agent(
        self,
        api_key: str,
        *,
        hermes_port: int = 8642,
        node_port: int = 8765,
        remote_dir: str = "~/.xuanji-node",
    ) -> dict:
        return {"success": True, "output": "started"}

    def check_node_agent(self, port: int = 8765, api_key: str = "") -> dict:
        return {"online": True, "output": '{"status":"ok"}'}


def test_check_hermes_installed():
    runner = FakeSSHRunner()
    runner.responses["hermes --version 2>&1 || echo NOT_INSTALLED"] = (0, "Hermes Agent v0.19.0", "")
    result = runner.check_hermes()
    assert result["installed"] is True
    assert "0.19.0" in result["version"]


def test_check_hermes_not_installed():
    runner = FakeSSHRunner()
    runner.responses["hermes --version 2>&1 || echo NOT_INSTALLED"] = (1, "NOT_INSTALLED", "")
    result = runner.check_hermes()
    assert result["installed"] is False


def test_provisioning_workflow_success():
    runner = FakeSSHRunner()
    runner.responses["echo ok"] = (0, "ok", "")
    runner.responses["hermes --version 2>&1 || echo NOT_INSTALLED"] = (0, "Hermes Agent v0.19.0", "")
    runner.responses["hermes doctor 2>&1"] = (0, "All checks passed", "")
    runner.responses["hermes config set api_server.enabled true && hermes config set api_server.port 8642 && hermes gateway start 2>&1"] = (0, "Gateway started", "")
    runner.responses["curl -sf http://127.0.0.1:8642/v1/capabilities 2>&1 || echo OFFLINE"] = (0, '{"models":[]}', "")

    svc = ProvisioningService(node_agent_dir=Path(__file__).resolve().parents[2] / "node-agent")
    # Monkey-patch the runner
    svc._create_runner = lambda host: runner
    host = SSHHost(host="192.168.1.100")
    steps = svc.provision_remote(host, api_key="test-key", hermes_port=8642)

    assert steps[0]["step"] == "ssh_connect"
    assert steps[0]["success"] is True
    assert steps[1]["step"] == "check_hermes"
    assert steps[1]["installed"] is True
    # Hermes already installed, so no install step
    assert steps[2]["step"] == "doctor"
    assert steps[3]["step"] == "start_api_server"
    assert steps[4]["step"] == "verify_api_server"
    assert steps[4]["online"] is True
    assert steps[5]["step"] == "deploy_node_agent"
    assert steps[6]["step"] == "start_node_agent"
    assert steps[7]["step"] == "verify_node_agent"
    assert steps[7]["online"] is True


def test_provisioning_requires_verified_api_server_online():
    steps = [
        {"step": "ssh_connect", "success": True},
        {"step": "verify_node_agent", "online": False},
    ]

    assert provisioning_succeeded(steps) is False


def test_provisioning_stops_on_ssh_failure():
    runner = FakeSSHRunner()
    runner.responses["echo ok"] = (255, "", "Connection refused")

    svc = ProvisioningService()
    svc._create_runner = lambda host: runner
    steps = svc.provision_remote(SSHHost(host="bad-host"))

    assert len(steps) == 1
    assert steps[0]["success"] is False


def test_ssh_uses_host_key_verification_and_api_token_via_stdin(monkeypatch, tmp_path: Path):
    calls = []

    def fake_run(args, **kwargs):
        calls.append((args, kwargs))
        return subprocess.CompletedProcess(args, 0, "ok", "")

    monkeypatch.setattr(subprocess, "run", fake_run)
    known_hosts = tmp_path / "known_hosts"
    runner = SSHRunner(SSHHost(host="remote.test"), known_hosts_path=known_hosts)
    assert "StrictHostKeyChecking=yes" in runner._base_args()
    assert f"UserKnownHostsFile={known_hosts}" in runner._base_args()

    secret = "token-must-not-be-argv"
    runner.start_api_server(8642, secret)
    args, kwargs = calls[-1]
    assert secret not in " ".join(args)
    assert kwargs["input"] == f"{secret}\n"
