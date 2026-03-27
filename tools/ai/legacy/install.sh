#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-}"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PACKAGE_JSON="$REPO_ROOT/package.json"

if [[ -z "$TARGET_DIR" ]]; then
  echo "Usage: bash tools/ai/legacy/install.sh /path/to/project" >&2
  exit 1
fi

TARGET_DIR="$(realpath "$TARGET_DIR")"
target_had_agents="false"
target_had_claude="false"

if [[ -e "$TARGET_DIR/AGENTS.md" ]]; then
  target_had_agents="true"
fi

if [[ -e "$TARGET_DIR/CLAUDE.md" ]]; then
  target_had_claude="true"
fi

mkdir -p "$TARGET_DIR/.agents"
mkdir -p "$TARGET_DIR/.claude"
mkdir -p "$TARGET_DIR/agents"
mkdir -p "$TARGET_DIR/.agents/skills"
mkdir -p "$TARGET_DIR/.claude/agents"

if [[ -f "$REPO_ROOT/src/index.ts" && -f "$PACKAGE_JSON" ]] && grep -q '"name"[[:space:]]*:[[:space:]]*"ldev"' "$PACKAGE_JSON"; then
  npx tsx "$REPO_ROOT/src/index.ts" ai install --target "$TARGET_DIR"
elif command -v ldev >/dev/null 2>&1; then
  ldev ai install --target "$TARGET_DIR"
else
  echo "Standard ldev base package is required before applying the legacy overlay." >&2
  echo "Run 'ldev ai install --target $TARGET_DIR' from a machine with ldev available." >&2
  exit 1
fi

if [[ "$target_had_agents" == "true" ]]; then
  echo "Keeping existing AGENTS.md in target project." >&2
else
  cp "$SCRIPT_DIR/AGENTS.md" "$TARGET_DIR/AGENTS.md"
fi

cp -Rn "$SCRIPT_DIR/agents/." "$TARGET_DIR/agents/"
cp -Rn "$SCRIPT_DIR/.claude/agents/." "$TARGET_DIR/.claude/agents/"
cp -Rn "$SCRIPT_DIR/skills/." "$TARGET_DIR/.agents/skills/"

if [[ "$target_had_claude" == "true" ]]; then
  echo "Keeping existing CLAUDE.md in target project." >&2
else
  cp "$SCRIPT_DIR/CLAUDE.md.template" "$TARGET_DIR/CLAUDE.md"
fi

echo "Legacy AI package copied to: $TARGET_DIR"
echo "Next steps:"
echo "  0. If the standard package was not installed automatically, run: ldev ai install --target $TARGET_DIR"
echo "  1. Review AGENTS.md and CLAUDE.md"
echo "  2. Validate with: bash agents/validate-all.sh"
echo "  3. Start the local runtime with: ldev start"
