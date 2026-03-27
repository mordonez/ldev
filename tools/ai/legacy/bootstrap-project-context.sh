#!/usr/bin/env bash
set -euo pipefail

TARGET_DIR="${1:?Usage: bootstrap-project-context.sh <target-dir>}"
OUTPUT_FILE="${TARGET_DIR}/CLAUDE.md"
PROJECT_NAME="$(basename "$TARGET_DIR")"

cat > "$OUTPUT_FILE" <<EOF
# CLAUDE.md — ${PROJECT_NAME}

Project-owned AI context file.

Fill in the TODOs with repository-specific knowledge only.

## First commands

\`\`\`bash
ldev doctor
ldev context --json
ldev start
\`\`\`

## Repository-specific facts

- Project name: ${PROJECT_NAME}
- Workspace root: [TODO]
- Main modules path: [TODO]
- Main theme path: [TODO]
- Main fragments path: [TODO]
- Journal resources path: [TODO]

## Delivery facts

- Branch convention: [TODO]
- PR convention: [TODO]
- CI/CD notes: [TODO]

## Local runtime facts

- Default local URL: [TODO]
- Local admin credentials: [TODO]
- Known environment caveats: [TODO]

## Project-specific workflows

- [TODO] fragment workflow
- [TODO] content migration workflow
- [TODO] deployment caveats
EOF

echo "Generated $OUTPUT_FILE from the legacy template."
