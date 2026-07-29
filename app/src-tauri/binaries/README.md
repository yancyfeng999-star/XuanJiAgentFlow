# Coordinator sidecar binaries

Place the PyInstaller-built `xuanji-coordinator` binary here for Tauri packaging.

Expected names (Tauri appends target triple automatically in some setups):
- `xuanji-coordinator` (source for externalBin `binaries/xuanji-coordinator`)
- Or platform-specific: `xuanji-coordinator-aarch64-apple-darwin`

Build from repo:

```bash
cd backend
# optional: pyinstaller xuanji-coordinator.spec
# copy dist/xuanji-coordinator to app/src-tauri/binaries/
```

Production app launches **only** this sidecar — never source-tree Python.
