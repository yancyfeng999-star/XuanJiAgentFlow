"""CLI entry for the Xuanji Coordinator sidecar.

Usage:
    xuanji-coordinator --port 0 --data-dir PATH
"""

from __future__ import annotations

import argparse
import socket
import sys
from pathlib import Path


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="xuanji-coordinator")
    parser.add_argument(
        "--port",
        type=int,
        default=0,
        help="TCP port to bind (0 selects an free port)",
    )
    parser.add_argument(
        "--data-dir",
        type=Path,
        required=True,
        help="Directory for SQLite, vault and project data",
    )
    parser.add_argument(
        "--host",
        default="127.0.0.1",
        help="Bind host (default 127.0.0.1)",
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

    # Parent supervisor parses this exact line.
    print(f"XUANJI_PORT={port}", flush=True)
    print(f"XUANJI_DATA_DIR={data_dir}", flush=True)

    try:
        import uvicorn
    except ImportError as exc:  # pragma: no cover - packaging concern
        print(f"XUANJI_ERROR=uvicorn_missing:{exc}", flush=True, file=sys.stderr)
        raise SystemExit(2) from exc

    from xuanji.api.app import CoordinatorConfig, create_coordinator_app

    app = create_coordinator_app(CoordinatorConfig(data_dir=data_dir))
    print(f"XUANJI_STATUS=starting host={host} port={port}", flush=True)
    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
