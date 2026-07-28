#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BACKEND_DIR="$ROOT/backend"
NODE_AGENT_DIR="$ROOT/node-agent"
APP_DIR="$ROOT/app"
VENV_DIR="$ROOT/.venv"
SKIP_E2E=false
SKIP_TAURI_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-e2e) SKIP_E2E=true ;;
    --skip-tauri-build) SKIP_TAURI_BUILD=true ;;
    *)
      echo "Unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if [[ ! -x "$VENV_DIR/bin/python" ]]; then
  if [[ -n "${PYTHON:-}" ]]; then
    PYTHON_BIN="$PYTHON"
  else
    PYTHON_BIN="$(command -v python3)"
  fi
  "$PYTHON_BIN" -m venv "$VENV_DIR"
fi

PY="$VENV_DIR/bin/python"
"$PY" -m pip install -q -e "$BACKEND_DIR[test]" -e "$NODE_AGENT_DIR[test]"

(cd "$APP_DIR" && npm ci)

echo "=== 1. Backend tests ==="
"$PY" -m pytest -q "$BACKEND_DIR/tests"

echo
echo "=== 2. Node Agent tests ==="
"$PY" -m pytest -q "$NODE_AGENT_DIR/tests"

echo
echo "=== 3. Frontend tests ==="
(cd "$APP_DIR" && npm test)

echo
echo "=== 4. Frontend lint ==="
(cd "$APP_DIR" && npm run lint)

echo
echo "=== 5. Frontend build ==="
(cd "$APP_DIR" && npm run build)

if [[ "$SKIP_E2E" == false ]]; then
  echo
  if [[ -f "$APP_DIR/playwright.config.ts" || -f "$APP_DIR/playwright.config.js" || \
        -f "$APP_DIR/playwright.config.mts" || -f "$APP_DIR/playwright.config.mjs" || \
        -f "$APP_DIR/playwright.config.cts" || -f "$APP_DIR/playwright.config.cjs" ]]; then
    echo "=== 6. Frontend E2E tests ==="
    (cd "$APP_DIR" && npm run test:e2e)
  else
    echo "=== 6. Frontend E2E tests (skipped: Playwright configuration not yet present) ==="
  fi
fi

echo
echo "=== 7. Python compilation check ==="
"$PY" -m compileall -q \
  "$BACKEND_DIR/src" "$BACKEND_DIR/tests" \
  "$NODE_AGENT_DIR/app.py" "$NODE_AGENT_DIR/executor.py" "$NODE_AGENT_DIR/tests"

echo
echo "=== 8. Cargo tests ==="
cargo test --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

echo
echo "=== 9. Cargo check ==="
cargo check --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

if [[ "$SKIP_TAURI_BUILD" == false ]]; then
  echo
  echo "=== 10. Tauri build ==="
  (cd "$APP_DIR" && npm run build:tauri)
fi

echo
echo "All checks passed"
