from __future__ import annotations

import subprocess
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
            input_text = api_key
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
        # Upload package
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
            f"mkdir -p {remote_dir} && cd {remote_dir} && tar xzf package.tar.gz && pip install -e . 2>&1",
            timeout=120,
        )
        return {"success": code == 0, "output": out[-1000:], "error": err[-500:] if code != 0 else None}


def provisioning_succeeded(steps: list[dict]) -> bool:
    if not steps or steps[-1].get("step") != "verify_api_server":
        return False
    if steps[-1].get("online") is not True:
        return False
    return all(
        step.get("success", step.get("installed", step.get("online", False))) is True
        for step in steps
    )


class ProvisioningService:
    """High-level provisioning workflow."""

    def __init__(self, *, known_hosts_path: str | Path | None = None) -> None:
        self.known_hosts_path = Path(known_hosts_path) if known_hosts_path else None

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

        # Step 6: Verify API server
        verify = runner.check_api_server(hermes_port)
        steps.append({"step": "verify_api_server", **verify})

        return steps
