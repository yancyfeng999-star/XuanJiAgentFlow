"""CLI entry for the Xuanji Coordinator sidecar.

Usage:
    xuanji-coordinator --port 0 --data-dir PATH
"""

from __future__ import annotations

import argparse
import secrets
import socket
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="xuanji-coordinator")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="监听的 TCP 端口（0 表示自动选择空闲端口）",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="SQLite、本地配置和项目数据目录",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="监听地址（默认 127.0.0.1）",
    )
    return parser.parse_args(argv)


def allocate_port(host: str, preferred: int) -> int:
    if preferred != 0:
        return preferred
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind((host, 0))
        return int(sock.getsockname()[1])


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    host = args.host
    port = allocate_port(host, args.port)
    data_dir = args.data_dir.expanduser().resolve()
    data_dir.mkdir(parents=True, exist_ok=True)
    session_token = secrets.token_urlsafe(32)

    # Parent supervisor parses this exact line. Extra stdout after the port is
    # normal; the supervisor must keep the pipe open, but we still avoid crashing
    # if a parent process dropped the reader (BrokenPipe).
    def emit(message: str, *, stream=sys.stdout) -> None:
        try:
            print(message, flush=True, file=stream)
        except BrokenPipeError:
            pass

    emit(f"XUANJI_SESSION_TOKEN={session_token}")
    emit(f"XUANJI_PORT={port}")
    emit(f"XUANJI_DATA_DIR={data_dir}")

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - packaging concern
        emit("XUANJI_ERROR=uvicorn_missing:缺少 uvicorn 运行依赖", stream=sys.stderr)
        raise SystemExit(2) from exc

    from xuanji.api.app import CoordinatorConfig, create_coordinator_app

    app = create_coordinator_app(
        CoordinatorConfig(data_dir=data_dir, session_token=session_token)
    )
    emit(f"XUANJI_STATUS=starting host={host} port={port}")
    # Prefer quieter access logs in packaged mode — still works if parent drains.
    uvicorn.run(app, host=host, port=port, log_level="warning")


if __name__ == "__main__":
    main()
