#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-}"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

if [[ -z "$TARGET_DIR" ]]; then
  echo "Usage: bash tools/ai/legacy/install.sh /path/to/project" >&2
  exit 1
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"

mkdir -p "$TARGET_DIR/.agents"
mkdir -p "$TARGET_DIR/.claude"
mkdir -p "$TARGET_DIR/agents"
mkdir -p "$TARGET_DIR/.agents/skills"
mkdir -p "$TARGET_DIR/.claude/agents"

if [[ -f "$REPO_ROOT/src/index.ts" ]]; then
  npx tsx "$REPO_ROOT/src/index.ts" ai install --target "$TARGET_DIR"
elif command -v ldev >/dev/null 2>&1; then
  ldev ai install --target "$TARGET_DIR"
fi

cp "$SCRIPT_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
cp -R "$SCRIPT_DIR/agents/." "$TARGET_DIR/agents/"
cp -R "$SCRIPT_DIR/.claude/agents/." "$TARGET_DIR/.claude/agents/"
cp -R "$SCRIPT_DIR/skills/." "$TARGET_DIR/.agents/skills/"

if [[ ! -f "$TARGET_DIR/CLAUDE.md" ]]; then
  cp "$SCRIPT_DIR/CLAUDE.md.template" "$TARGET_DIR/CLAUDE.md"
fi

echo "Legacy AI package copied to: $TARGET_DIR"
echo "Next steps:"
echo "  0. If the standard package was not installed automatically, run: ldev ai install --target $TARGET_DIR"
echo "  1. Review AGENTS.md and CLAUDE.md"
echo "  2. Validate with: bash agents/validate-all.sh"
echo "  3. Start the local runtime with: ldev start"
