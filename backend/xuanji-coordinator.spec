# -*- mode: python ; coding: utf-8 -*-
"""PyInstaller spec for the Xuanji Coordinator sidecar.

Build (from repo root or backend/):
    pyinstaller backend/xuanji-coordinator.spec

Produces dist/xuanji-coordinator which Tauri bundles as externalBin.
"""

from pathlib import Path

block_cipher = None
backend_root = Path(SPECPATH).resolve()
src_root = backend_root / "src"

a = Analysis(
    [str(src_root / "xuanji" / "__main__.py")],
    pathex=[str(src_root)],
    binaries=[],
    datas=[],
    hiddenimports=[
        "uvicorn",
        "uvicorn.logging",
        "uvicorn.loops",
        "uvicorn.loops.auto",
        "uvicorn.protocols",
        "uvicorn.protocols.http",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan",
        "uvicorn.lifespan.on",
        "fastapi",
        "starlette",
        "pydantic",
        "xuanji",
        "xuanji.api",
        "xuanji.api.app",
        "xuanji.api.projects",
        "xuanji.api.workflows",
        "xuanji.api.runs",
        "xuanji.api.nodes",
        "xuanji.api.security",
        "xuanji.api.planner",
        "xuanji.api.artifacts",
        "xuanji.api.events",
        "xuanji.api.errors",
        "xuanji.domain",
        "xuanji.execution",
        "xuanji.planner",
        "xuanji.scheduler",
        "xuanji.security",
        "xuanji.storage",
        "xuanji.nodes",
        "xuanji.artifacts",
        "xuanji.provisioning",
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.zipfiles,
    a.datas,
    [],
    name="xuanji-coordinator",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
