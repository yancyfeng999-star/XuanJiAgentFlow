from __future__ import annotations

import os
import platform
from typing import Any

def build_diagnostics(services) -> dict[str, Any]:
    models = services.thinking_models.list_public() if services.thinking_models else []
    nodes = services.nodes.list()
    return {
        "appVersion": "0.3.4",
        "osVersion": platform.platform(),
        "architecture": platform.machine(),
        "coordinator": "ready",
        "database": "ready",
        "thinkingModels": {
            "total": len(models),
            "enabled": sum(1 for item in models if item["enabled"]),
            "defaultConfigured": any(item["is_default"] and item["credential_configured"] for item in models),
        },
        "nodes": {
            "total": len(nodes),
            "online": sum(1 for node in nodes if str(getattr(node.status, "value", node.status)) == "online"),
        },
        "updateService": "unavailable",
        "errorCodes": [],
        "paths": {"dataDir": os.path.basename(str(services.config.data_dir))},
    }
