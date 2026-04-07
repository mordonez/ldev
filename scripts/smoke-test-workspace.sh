#!/usr/bin/env bash
# smoke-test-workspace.sh
#
# Validates the current Workspace-first ldev flow end-to-end:
#
#   1. blade init <workspace>
#   2. blade gw initBundle
#   3. ldev doctor
#   4. ldev context --json
#   5. ldev start
#   6. ldev deploy all
#   7. ldev status / logs
#   8. ldev stop
#
# This smoke intentionally targets the local bundle/server path.
# It does not validate the official Workspace Docker container tasks yet.
#
# Usage:
#   ./scripts/smoke-test-workspace.sh
#   WORKSPACE_PRODUCT=dxp-2026.q1.0-lts ./scripts/smoke-test-workspace.sh

set -euo pipefail

LDEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LDEV="npx tsx ${LDEV_ROOT}/src/index.ts"
WORKSPACE_PRODUCT="${WORKSPACE_PRODUCT:-dxp-2026.q1.0-lts}"
WORKSPACE_NAME="${WORKSPACE_NAME:-ai-workspace}"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"
TEST_BASE="$(mktemp -d /tmp/ldev-workspace-smoke-XXXXXX)"
WORKSPACE_DIR="${TEST_BASE}/${WORKSPACE_NAME}"
KEEP_WORKSPACE="${KEEP_WORKSPACE:-0}"

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓ $*${NC}"; }
fail() { echo -e "  ${RED}✗ $*${NC}"; }
warn() { echo -e "  ${YELLOW}! $*${NC}"; }
log()  { echo -e "  $*"; }

cleanup() {
  if [[ "${KEEP_WORKSPACE}" == "1" ]]; then
    warn "Keeping workspace at ${WORKSPACE_DIR}"
    return
  fi

  if [[ -d "${WORKSPACE_DIR}" ]]; then
    (cd "${WORKSPACE_DIR}" && ${LDEV} stop >/dev/null 2>&1) || true
  fi

  rm -rf "${TEST_BASE}"
}
trap cleanup EXIT

require_command() {
  local command="$1"
  if ! command -v "${command}" >/dev/null 2>&1; then
    fail "Required command not found: ${command}"
    exit 1
  fi
}

assert_json_ok() {
  local label="$1"
  local file="$2"
  node -e "
    const fs = require('node:fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (data.ok !== true) {
      throw new Error('expected ok=true');
    }
  " "${file}" >/dev/null
  ok "${label}"
}

run_json_command() {
  local label="$1"
  local output_file="$2"
  shift 2
  log "$*"
  if "$@" >"${output_file}"; then
    assert_json_ok "${label}" "${output_file}"
  else
    fail "${label}"
    return 1
  fi
}

main() {
  echo -e "\n${BOLD}=== ldev Workspace smoke ===${NC}"
  echo -e "Workspace root: ${WORKSPACE_DIR}"
  echo -e "Workspace product: ${WORKSPACE_PRODUCT}\n"

  require_command blade
  require_command java
  require_command node

  if ! docker info >/dev/null 2>&1; then
    warn "Docker is not running. This is acceptable for the current local Workspace smoke."
  else
    ok "Docker running"
  fi

  log "blade init -v ${WORKSPACE_PRODUCT} ${WORKSPACE_NAME}"
  (
    cd "${TEST_BASE}"
    blade init -v "${WORKSPACE_PRODUCT}" "${WORKSPACE_NAME}"
  )
  ok "Workspace created"

  log "blade gw initBundle"
  (
    cd "${WORKSPACE_DIR}"
    blade gw initBundle
  )
  ok "Bundle initialized"

  local doctor_json="${TEST_BASE}/doctor.json"
  run_json_command \
    "doctor --json passed" \
    "${doctor_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} doctor --format json"

  node -e "
    const fs = require('node:fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    const projectType = data.environment?.projectType;
    if (projectType !== 'blade-workspace') {
      throw new Error('expected blade-workspace, got ' + projectType);
    }
  " "${doctor_json}"
  ok "doctor reports blade-workspace"

  local context_json="${TEST_BASE}/context.json"
  run_json_command \
    "context --json passed" \
    "${context_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} context --json"

  node -e "
    const fs = require('node:fs');
    const data = JSON.parse(fs.readFileSync(process.argv[1], 'utf8'));
    if (data.projectType !== 'blade-workspace') {
      throw new Error('expected blade-workspace, got ' + data.projectType);
    }
  " "${context_json}"
  ok "context reports blade-workspace"

  local start_json="${TEST_BASE}/start.json"
  run_json_command \
    "start --json passed" \
    "${start_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} start --format json --timeout \"${HEALTH_TIMEOUT}\""

  local deploy_json="${TEST_BASE}/deploy.json"
  run_json_command \
    "deploy all --json passed" \
    "${deploy_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} deploy all --format json"

  local status_json="${TEST_BASE}/status.json"
  run_json_command \
    "status --json passed" \
    "${status_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} status --format json"

  log "ldev logs --no-follow"
  if bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} logs --no-follow >/dev/null"; then
    ok "logs --no-follow passed"
  else
    fail "logs --no-follow passed"
    return 1
  fi

  local stop_json="${TEST_BASE}/stop.json"
  run_json_command \
    "stop --json passed" \
    "${stop_json}" \
    bash -lc "cd \"${WORKSPACE_DIR}\" && ${LDEV} stop --format json"

  echo -e "\n${GREEN}Workspace smoke passed.${NC}"
}

main
