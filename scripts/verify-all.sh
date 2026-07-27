#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PY="$ROOT/backend/.venv/bin/python"

echo "=== 1. Backend tests ==="
"$PY" -m pytest -q backend/tests

echo ""
echo "=== 2. Node Agent tests ==="
"$PY" -m pytest -q node-agent/tests

echo ""
echo "=== 3. Frontend tests ==="
cd app && npm test && cd ..

echo ""
echo "=== 4. Frontend build ==="
cd app && npm run build && cd ..

echo ""
echo "=== 5. Frontend lint ==="
cd app && npm run lint && cd ..

echo ""
echo "=== 6. Backend compilation check ==="
"$PY" -m compileall -q backend/src backend/tests

echo ""
echo "=== 7. Git status ==="
git status --short

echo ""
echo "✅ All checks passed"
