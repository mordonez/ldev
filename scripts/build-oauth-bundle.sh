#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE_DIR="$ROOT_DIR/templates/modules"

cd "$MODULE_DIR"

if command -v cmd.exe >/dev/null 2>&1 && [[ -f gradlew.bat ]]; then
  cmd.exe //c gradlew.bat clean jar stageReleaseBundle test
else
  ./gradlew clean jar stageReleaseBundle test
fi

echo
echo "OAuth installer bundle rebuilt:"
echo "  $ROOT_DIR/templates/bundles/dev.mordonez.ldev.oauth2.app-1.0.0.jar"
