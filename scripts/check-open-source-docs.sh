#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

required=(
  README.md
  LICENSE
  NOTICE
  SECURITY.md
  CONTRIBUTING.md
  docs/OPEN_SOURCE.md
  .github/ISSUE_TEMPLATE/bug-report.yml
  .github/ISSUE_TEMPLATE/feature-request.yml
  .github/PULL_REQUEST_TEMPLATE.md
)

missing=0
for file in "${required[@]}"; do
  if [[ ! -f "$file" ]]; then
    echo "missing $file"
    missing=1
  fi
done

if ! grep -q "Apache License" LICENSE; then
  echo "LICENSE is not Apache-2.0"
  missing=1
fi
if ! grep -q "LICENSE" README.md; then
  echo "README.md must link LICENSE"
  missing=1
fi
if ! grep -q "Apache" NOTICE; then
  echo "NOTICE must mention Apache/dependencies"
  missing=1
fi

if [[ "$missing" -ne 0 ]]; then
  exit 1
fi
echo "open-source docs check passed"
