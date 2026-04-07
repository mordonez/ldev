#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODULE_DIR="$ROOT_DIR/templates/modules"

cd "$MODULE_DIR"
./gradlew clean jar stageReleaseBundle test

echo
echo "OAuth installer bundle rebuilt:"
echo "  $ROOT_DIR/templates/bundles/dev.mordonez.ldev.oauth2.app-1.0.0.jar"
