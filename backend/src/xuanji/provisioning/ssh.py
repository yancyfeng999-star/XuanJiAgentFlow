from __future__ import annotations

import base64
import shlex
import subprocess
import sys
import tarfile
import tempfile
from dataclasses import dataclass
from pathlib import Path


@dataclass
class SSHHost:
    host: str
    port: int = 22
    user: str = "root"
    key_path: str | None = None


def app_known_hosts_path(data_dir: str | Path) -> Path:
    """Application-scoped known_hosts path (never system ~/.ssh for tunnels/provisioning)."""
    return Path(data_dir) / "ssh" / "known_hosts"


def ensure_known_hosts_file(path: str | Path) -> Path:
    """Create an empty known_hosts file if missing; parent dirs are created."""
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    if not target.exists():
        target.touch()
    return target


class SSHRunner:
    """Executes SSH commands for remote node provisioning.

    Always uses StrictHostKeyChecking=yes with an explicit UserKnownHostsFile.
    Never passes node tokens on argv — tokens (when needed) go via stdin only.
    """

    def __init__(self, host: SSHHost, *, known_hosts_path: str | Path | None = None) -> None:
        self.host = host
        self.known_hosts_path = ensure_known_hosts_file(
            known_hosts_path or Path.home() / ".ssh" / "known_hosts"
        )

    def _base_args(self) -> list[str]:
        args = [
            "ssh",
            "-o", "StrictHostKeyChecking=yes",
            "-o", f"UserKnownHostsFile={self.known_hosts_path}",
            "-o", "ConnectTimeout=10",
            "-o", "BatchMode=yes",
            "-p", str(self.host.port),
        ]
        if self.host.key_path:
            args.extend(["-i", self.host.key_path])
        args.append(f"{self.host.user}@{self.host.host}")
        return args

    def run(
        self,
        command: str,
        timeout: float = 30,
        *,
        input_text: str | None = None,
    ) -> tuple[int, str, str]:
        args = self._base_args() + [command]
        result = subprocess.run(
            args,
            capture_output=True,
            text=True,
            timeout=timeout,
            input=input_text,
        )
        return result.returncode, result.stdout, result.stderr

    def check_hermes(self) -> dict:
        code, out, err = self.run("hermes --version 2>&1 || echo NOT_INSTALLED")
        installed = "NOT_INSTALLED" not in out
        return {"installed": installed, "version": out.strip() if installed else None, "error": err.strip() if not installed else None}

    def install_hermes(self, timeout: float = 120) -> dict:
        code, out, err = self.run(
            'curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash -s -- -y 2>&1',
            timeout=timeout,
        )
        return {"success": code == 0, "output": out[-2000:], "error": err[-1000:] if code != 0 else None}

    def doctor(self) -> dict:
        code, out, err = self.run("hermes doctor 2>&1", timeout=60)
        return {"success": code == 0, "output": out[-2000:], "error": err[-1000:] if code != 0 else None}

    def start_api_server(self, port: int = 8642, api_key: str = "") -> dict:
        cmd = f"hermes config set api_server.enabled true && hermes config set api_server.port {port}"
        input_text = None
        if api_key:
            cmd += " && IFS= read -r api_key && hermes config set api_server.api_key \"$api_key\""
            input_text = f"{api_key}\n"
        cmd += " && hermes gateway start 2>&1"
        code, out, err = self.run(cmd, timeout=30, input_text=input_text)
        return {"success": code == 0, "output": out[-1000:], "error": err[-500:] if code != 0 else None}

    def stop_api_server(self) -> dict:
        code, out, err = self.run("hermes gateway stop 2>&1", timeout=15)
        return {"success": code == 0, "output": out[-500:]}

    def check_api_server(self, port: int = 8642) -> dict:
        code, out, err = self.run(f"curl -sf http://127.0.0.1:{port}/v1/capabilities 2>&1 || echo OFFLINE")
        online = "OFFLINE" not in out and code == 0
        return {"online": online, "output": out[:500]}

    def deploy_node_agent(self, local_package_path: str, remote_dir: str = "~/.xuanji-node") -> dict:
        code, _, err = self.run(f"mkdir -p {remote_dir}")
        if code != 0:
            return {"success": False, "error": err[-500:]}
        scp_args = [
            "scp",
            "-o", "StrictHostKeyChecking=yes",
            "-o", f"UserKnownHostsFile={self.known_hosts_path}",
            "-P", str(self.host.port),
        ]
        if self.host.key_path:
            scp_args.extend(["-i", self.host.key_path])
        scp_args.extend([local_package_path, f"{self.host.user}@{self.host.host}:{remote_dir}/package.tar.gz"])
        result = subprocess.run(scp_args, capture_output=True, text=True, timeout=60)
        if result.returncode != 0:
            return {"success": False, "error": result.stderr[-500:]}

        # Extract and install
        code, out, err = self.run(
            f"mkdir -p {remote_dir} && cd {remote_dir} && tar xzf package.tar.gz && "
            "python3 -m venv .venv && .venv/bin/python -m pip install -e . 2>&1",
            timeout=120,
        )
        return {"success": code == 0, "output": out[-1000:], "error": err[-500:] if code != 0 else None}

    def start_node_agent(
        self,
        api_key: str,
        *,
        hermes_port: int = 8642,
        node_port: int = 8765,
        remote_dir: str = "~/.xuanji-node",
    ) -> dict:
        unit = f"""[Unit]
Description=Xuanji Node Agent
After=network-online.target

[Service]
Type=simple
User={self.host.user}
WorkingDirectory=%h/.xuanji-node
EnvironmentFile=%h/.xuanji-node/node.env
ExecStart=%h/.xuanji-node/.venv/bin/python -m uvicorn app:app --app-dir %h/.xuanji-node --host 127.0.0.1 --port {node_port}
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
"""
        encoded_unit = base64.b64encode(unit.encode("utf-8")).decode("ascii")
        encoded_token = base64.b64encode(api_key.encode("utf-8")).decode("ascii")
        command = (
            f"mkdir -p {remote_dir} && IFS= read -r token_b64 && "
            f"token=$(printf %s \"$token_b64\" | base64 -d) && "
            f"printf 'XUANJI_NODE_TOKEN=%s\\nHERMES_MODE=cli\\nHERMES_API_KEY=%s\\nHERMES_API_URL=http://127.0.0.1:{hermes_port}\\n' "
            f"\"$token\" \"$token\" > {remote_dir}/node.env && chmod 600 {remote_dir}/node.env && "
            f"printf %s {shlex.quote(encoded_unit)} | base64 -d | sudo tee /etc/systemd/system/xuanji-node.service >/dev/null && "
            "sudo systemctl daemon-reload && sudo systemctl enable xuanji-node.service && "
            "sudo systemctl restart xuanji-node.service"
        )
        code, out, err = self.run(command, timeout=60, input_text=f"{encoded_token}\n")
        return {"success": code == 0, "output": out[-1000:], "error": err[-500:] if code != 0 else None}

    def check_node_agent(self, port: int = 8765, api_key: str = "") -> dict:
        encoded_token = base64.b64encode(api_key.encode("utf-8")).decode("ascii")
        command = (
            "IFS= read -r token_b64 && token=$(printf %s \"$token_b64\" | base64 -d) && "
            f"curl -sf -H \"Authorization: Bearer $token\" http://127.0.0.1:{port}/v1/health "
            "2>&1 || echo OFFLINE"
        )
        code, out, _ = self.run(command, input_text=f"{encoded_token}\n")
        online = "OFFLINE" not in out and code == 0
        return {"online": online, "output": out[:500]}


def provisioning_succeeded(steps: list[dict]) -> bool:
    if not steps or steps[-1].get("step") != "verify_node_agent":
        return False
    if steps[-1].get("online") is not True:
        return False
    return all(
        step.get("success", step.get("installed", step.get("online", False))) is True
        for step in steps
    )


class ProvisioningService:
    """High-level provisioning workflow."""

    def __init__(
        self,
        *,
        known_hosts_path: str | Path | None = None,
        node_agent_dir: str | Path | None = None,
    ) -> None:
        self.known_hosts_path = Path(known_hosts_path) if known_hosts_path else None
        self.node_agent_dir = Path(node_agent_dir) if node_agent_dir else self._default_node_agent_dir()

    @staticmethod
    def _default_node_agent_dir() -> Path:
        if getattr(sys, "frozen", False):
            return Path(getattr(sys, "_MEIPASS")) / "node-agent"
        return Path(__file__).resolve().parents[4] / "node-agent"

    def _package_node_agent(self) -> str:
        required = ("app.py", "executor.py", "pyproject.toml")
        if not all((self.node_agent_dir / name).is_file() for name in required):
            raise FileNotFoundError(f"节点代理安装包缺失：{self.node_agent_dir}")
        descriptor, archive_path = tempfile.mkstemp(prefix="xuanji-node-", suffix=".tar.gz")
        Path(archive_path).unlink(missing_ok=True)
        import os
        os.close(descriptor)
        with tarfile.open(archive_path, "w:gz") as archive:
            for name in required:
                archive.add(self.node_agent_dir / name, arcname=name)
        return archive_path

    def _create_runner(self, host: SSHHost) -> SSHRunner:
        return SSHRunner(host, known_hosts_path=self.known_hosts_path)

    def provision_remote(self, host: SSHHost, api_key: str = "", hermes_port: int = 8642) -> list[dict]:
        runner = self._create_runner(host)
        steps = []

        # Step 1: Check SSH connectivity
        code, out, err = runner.run("echo ok")
        steps.append({"step": "ssh_connect", "success": code == 0, "output": out.strip()})
        if code != 0:
            return steps

        # Step 2: Check Hermes installation
        check = runner.check_hermes()
        steps.append({"step": "check_hermes", **check})

        # Step 3: Install if needed
        if not check["installed"]:
            install = runner.install_hermes()
            steps.append({"step": "install_hermes", **install})
            if not install["success"]:
                return steps

        # Step 4: Run doctor
        doctor = runner.doctor()
        steps.append({"step": "doctor", **doctor})

        # Step 5: Configure and start API server
        start = runner.start_api_server(hermes_port, api_key)
        steps.append({"step": "start_api_server", **start})

        # Step 6: Verify Hermes API server
        verify = runner.check_api_server(hermes_port)
        steps.append({"step": "verify_api_server", **verify})
        if not verify["online"]:
            return steps

        # Step 7: Deploy and install the protocol adapter used by Coordinator.
        package_path = self._package_node_agent()
        try:
            deploy = runner.deploy_node_agent(package_path)
        finally:
            Path(package_path).unlink(missing_ok=True)
        steps.append({"step": "deploy_node_agent", **deploy})
        if not deploy["success"]:
            return steps

        # Step 8: Install/restart the Node Agent service without exposing the token on argv.
        start_node = runner.start_node_agent(api_key, hermes_port=hermes_port, node_port=8765)
        steps.append({"step": "start_node_agent", **start_node})
        if not start_node["success"]:
            return steps

        # Step 9: Verify the actual Coordinator protocol endpoint.
        verify_node = runner.check_node_agent(8765, api_key)
        steps.append({"step": "verify_node_agent", **verify_node})

        return steps
