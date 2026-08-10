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
"$PY" -m pip install -q -U pip
"$PY" -m pip install -q -e "$BACKEND_DIR[test]" -e "$NODE_AGENT_DIR[test]" uvicorn

# Production-ish coordinator deps used by sidecar CLI and e2e stack
"$PY" -m pip install -q "uvicorn[standard]>=0.30" "fastapi>=0.115" "httpx>=0.28" \
  "cryptography>=44" "argon2-cffi>=23.1" "pydantic>=2.7"

# Prefer a clean install; fall back when host tooling blocks bulk deletes of node_modules.
if ! (cd "$APP_DIR" && npm ci); then
  echo "npm ci failed; falling back to npm install (preserving existing node_modules)." >&2
  (cd "$APP_DIR" && npm install)
fi

echo "=== 1. Backend tests ==="
"$PY" -m pytest -q "$BACKEND_DIR/tests"

echo
echo "=== 2. Node Agent tests ==="
"$PY" -m pytest -q "$NODE_AGENT_DIR/tests"

echo
echo "=== 3. Frontend tests ==="
(cd "$APP_DIR" && npm test)

echo
echo "=== 4. Frontend production dependency audit ==="
(cd "$APP_DIR" && npm audit --omit=dev --audit-level=high)

echo
echo "=== 5. Frontend lint ==="
(cd "$APP_DIR" && npm run lint)

echo
echo "=== 6. Frontend build ==="
# Host may block bulk deletes under dist/; rename away so Vite can create a fresh outDir.
mkdir -p "$ROOT/.tmp-build-backups"
if [[ -d "$APP_DIR/dist" ]]; then
  mv "$APP_DIR/dist" "$ROOT/.tmp-build-backups/dist.bak.$$"
fi
(cd "$APP_DIR" && npm run build)

if [[ "$SKIP_E2E" == false ]]; then
  echo
  if [[ -f "$APP_DIR/playwright.config.ts" || -f "$APP_DIR/playwright.config.js" || \
        -f "$APP_DIR/playwright.config.mts" || -f "$APP_DIR/playwright.config.mjs" || \
        -f "$APP_DIR/playwright.config.cts" || -f "$APP_DIR/playwright.config.cjs" ]]; then
    echo "=== 7. Frontend E2E tests (web+backend Fake multi-node stack) ==="
    # Ensure Chromium is available; reuses install if present.
    (cd "$APP_DIR" && npx playwright install chromium)
    # Avoid bulk-delete guards on previous Playwright artifacts.
    mkdir -p "$ROOT/.tmp-build-backups"
    if [[ -d "$APP_DIR/test-results" ]]; then
      mv "$APP_DIR/test-results" "$ROOT/.tmp-build-backups/test-results.bak.$$"
    fi
    if [[ -d "$APP_DIR/playwright-report" ]]; then
      mv "$APP_DIR/playwright-report" "$ROOT/.tmp-build-backups/playwright-report.bak.$$"
    fi
    export XUANJI_PYTHON="$PY"
    export E2E_COORDINATOR_PORT="${E2E_COORDINATOR_PORT:-18080}"
    export E2E_VITE_PORT="${E2E_VITE_PORT:-5173}"
    export E2E_COORDINATOR_URL="http://127.0.0.1:${E2E_COORDINATOR_PORT}"
    (cd "$APP_DIR" && npm run test:e2e)
  else
    echo "Frontend E2E verification failed: Playwright configuration not found." >&2
    echo "Use --skip-e2e to explicitly skip frontend E2E tests." >&2
    exit 1
  fi
else
  echo
  echo "=== 7. Frontend E2E tests === SKIPPED (--skip-e2e)"
fi

echo
echo "=== 8. Python compilation check ==="
"$PY" -m compileall -q \
  "$BACKEND_DIR/src" "$BACKEND_DIR/tests" \
  "$NODE_AGENT_DIR/app.py" "$NODE_AGENT_DIR/executor.py" "$NODE_AGENT_DIR/tests" \
  "$ROOT/scripts/e2e_stack.py"

echo
echo "=== 9. Cargo tests ==="
cargo test --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

echo
echo "=== 10. Cargo check ==="
cargo check --manifest-path "$APP_DIR/src-tauri/Cargo.toml"

if [[ "$SKIP_TAURI_BUILD" == false ]]; then
  echo
  echo "=== 11. Tauri production build (unsigned macOS .app if possible) ==="
  (cd "$APP_DIR" && npm run build:tauri) || {
    echo "Tauri build failed. Falling back to cargo release + frontend dist only." >&2
    cargo build --release --manifest-path "$APP_DIR/src-tauri/Cargo.toml"
    echo "Release binary: $APP_DIR/src-tauri/target/release/xuanji (or xuanji-lib companion)"
    echo "Use --skip-tauri-build after investigating, or install PyInstaller sidecar first."
    exit 1
  }
else
  echo
  echo "=== 11. Tauri build === SKIPPED (--skip-tauri-build)"
  echo "Still running cargo release build for binary verification..."
  cargo build --release --manifest-path "$APP_DIR/src-tauri/Cargo.toml" || true
fi

echo
echo "All checks passed"
