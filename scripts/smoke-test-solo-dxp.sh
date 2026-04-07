#!/usr/bin/env bash
# smoke-test-solo-dxp.sh
#
# Focused end-to-end smoke test for the default local DXP flow:
#
#   1. ldev project init
#   2. ldev setup
#   3. ldev start
#   4. ldev oauth install --write-env
#   5. ldev oauth admin-unblock
#   6. ldev status / logs / context
#   7. ldev portal / resource inspection commands
#   8. ldev resource import round-trip checks
#   9. ldev env restart
#  10. ldev stop
#
# Prerequisites:
#   - Docker running
#   - ACTIVATION_KEY env var or first argument pointing to a DXP activation key XML
#
# Usage:
#   ./scripts/smoke-test-solo-dxp.sh [/path/to/activation-key.xml]
#   ACTIVATION_KEY=/path/to/key.xml npm run smoke:solo

set -euo pipefail

LDEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LDEV="npx tsx ${LDEV_ROOT}/src/index.ts"
ACTIVATION_KEY="${1:-${ACTIVATION_KEY:-}}"
JVM_OPTS="-Xms1g -Xmx2g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -Djava.net.preferIPv4Stack=true"
HEALTH_TIMEOUT="${HEALTH_TIMEOUT:-600}"
TEST_NAME="lsmoke-solo"
TEST_BASE="/tmp/ldev-smoke-solo-$$"
PROJECT_DIR="${TEST_BASE}/${TEST_NAME}"
HTTP_PORT="${HTTP_PORT:-8081}"
PASS=0
FAIL=0

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓ $*${NC}"; PASS=$((PASS + 1)); }
fail() { echo -e "  ${RED}✗ $*${NC}"; FAIL=$((FAIL + 1)); }
warn() { echo -e "  ${YELLOW}! $*${NC}"; }
log()  { echo -e "  $*"; }

preflight() {
  echo -e "\n${BOLD}=== Preflight ===${NC}"

  if [[ -z "$ACTIVATION_KEY" ]]; then
    fail "ACTIVATION_KEY not set. Pass as argument or set the env var."
    exit 1
  fi
  if [[ ! -f "$ACTIVATION_KEY" ]]; then
    fail "Activation key not found: $ACTIVATION_KEY"
    exit 1
  fi
  ok "Activation key: $(basename "$ACTIVATION_KEY")"

  if ! docker info >/dev/null 2>&1; then
    fail "Docker is not running"
    exit 1
  fi
  ok "Docker running"

  local free_mb=0
  free_mb=$(vm_stat 2>/dev/null | awk '/Pages free/ {printf "%d", int($3)*4096/1048576}') \
    || free_mb=$(free -m 2>/dev/null | awk '/^Mem/ {print $4}') \
    || free_mb=0
  if [[ "${free_mb:-0}" -lt 3000 ]]; then
    warn "Low free RAM (~${free_mb} MB) — test may be slow or crash. Run with no other Docker workloads."
  else
    ok "Free RAM: ~${free_mb} MB"
  fi
  echo ""
}

stop_environment() {
  if [[ -d "$PROJECT_DIR" ]]; then
    log "ldev stop"
    (cd "$PROJECT_DIR" && $LDEV stop >/dev/null 2>&1) || true
  fi
}

cleanup() {
  echo ""
  log "Cleaning up ..."
  stop_environment
  docker ps --filter "name=${TEST_NAME}" -q | xargs -r docker stop >/dev/null 2>&1 || true
  docker ps -a --filter "name=${TEST_NAME}" -q | xargs -r docker rm >/dev/null 2>&1 || true
  docker volume ls --filter "name=${TEST_NAME}" -q | xargs -r docker volume rm >/dev/null 2>&1 || true
  rm -rf "$TEST_BASE"
}
trap cleanup EXIT

configure_project_env() {
  local env_file="${PROJECT_DIR}/docker/.env"
  {
    echo "LIFERAY_HTTP_PORT=${HTTP_PORT}"
    echo "LIFERAY_DEBUG_PORT=$((HTTP_PORT + 1000))"
    echo "GOGO_PORT=$((HTTP_PORT + 2000))"
    echo "COMPOSE_PROJECT_NAME=${TEST_NAME}"
    echo "DOCLIB_VOLUME_NAME=${TEST_NAME}-doclib"
    echo "LIFERAY_JVM_OPTS=\"${JVM_OPTS}\""
  } >> "$env_file"
}

run_check() {
  local label="$1"
  shift

  log "$*"
  if "$@"; then
    ok "$label"
  else
    fail "$label"
  fi
}

run_check_with_retry() {
  local label="$1"
  local attempts="$2"
  local sleep_seconds="${3:-2}"
  shift 3

  local try=1
  while [[ "$try" -le "$attempts" ]]; do
    log "$*"
    if "$@"; then
      ok "$label"
      return 0
    fi

    if [[ "$try" -lt "$attempts" ]]; then
      warn "${label} failed on attempt ${try}/${attempts}; retrying ..."
      sleep "$sleep_seconds"
    fi

    try=$((try + 1))
  done

  fail "$label"
  return 1
}

main() {
  echo -e "\n${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  ldev solo DXP — focused end-to-end smoke test      ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"

  preflight
  mkdir -p "$TEST_BASE"

  log "bash -lc $LDEV project init --name \"$TEST_NAME\" --dir \"$PROJECT_DIR\" --commit"
  if bash -lc "$LDEV project init --name \"$TEST_NAME\" --dir \"$PROJECT_DIR\" --commit"; then
    ok "project init complete"
  else
    fail "project init complete"
    return 1
  fi

  configure_project_env

  log "bash -lc cd \"$PROJECT_DIR\" && $LDEV setup --skip-pull"
  if bash -lc "cd \"$PROJECT_DIR\" && $LDEV setup --skip-pull"; then
    ok "setup complete"
  else
    fail "setup complete"
    return 1
  fi

  log "bash -lc cd \"$PROJECT_DIR\" && $LDEV start --activation-key-file \"$ACTIVATION_KEY\" --timeout \"$HEALTH_TIMEOUT\""
  if bash -lc "cd \"$PROJECT_DIR\" && $LDEV start --activation-key-file \"$ACTIVATION_KEY\" --timeout \"$HEALTH_TIMEOUT\""; then
    ok "Liferay healthy"
  else
    fail "Liferay healthy"
    return 1
  fi

  log "bash -lc cd \"$PROJECT_DIR\" && $LDEV oauth install --write-env"
  if bash -lc "cd \"$PROJECT_DIR\" && $LDEV oauth install --write-env"; then
    ok "OAuth app installed and local profile updated"
  else
    fail "OAuth app installed and local profile updated"
    return 1
  fi

  if grep -q 'clientId:' "${PROJECT_DIR}/.liferay-cli.local.yml" && \
     grep -q 'clientSecret:' "${PROJECT_DIR}/.liferay-cli.local.yml"; then
    ok ".liferay-cli.local.yml contains OAuth2 credentials"
  else
    fail ".liferay-cli.local.yml contains OAuth2 credentials"
  fi

  run_check \
    "admin user unblocked" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV oauth admin-unblock"

  run_check \
    "status --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV status --json >/dev/null"

  run_check \
    "logs --no-follow passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV logs --no-follow --since 5m >/dev/null"

  run_check \
    "context --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV context --json >/dev/null"

  run_check \
    "portal check passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal check"

  run_check \
    "portal auth token passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal auth token >/dev/null"

  run_check \
    "portal inventory sites --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal inventory sites --json >/dev/null"

  run_check \
    "portal inventory pages --site /guest --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal inventory pages --site /guest --json >/dev/null"

  run_check \
    "portal inventory page --url /web/guest/home --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal inventory page --url /web/guest/home --json >/dev/null"

  run_check \
    "portal audit --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal audit --json >/dev/null"

  run_check \
    "portal page-layout export --url /web/guest/home --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal page-layout export --url /web/guest/home --json >/dev/null"

  run_check \
    "portal search indices --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal search indices --json >/dev/null"

  run_check \
    "portal search mappings --index liferay-0 --json passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal search mappings --index liferay-0 --json >/dev/null"

  run_check \
    "resource export-templates passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV resource export-templates >/dev/null"

  run_check \
    "resource export-structures passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV resource export-structures >/dev/null"

  run_check \
    "resource export-fragments passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV resource export-fragments >/dev/null"

  run_check \
    "resource import-templates --apply passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV resource import-templates --apply >/dev/null"

  run_check \
    "resource import-structures --apply passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV resource import-structures --apply >/dev/null"

  local final_url
  final_url=$(curl -fsS --max-time 15 -L -w "%{url_effective}" -o /dev/null \
    "http://127.0.0.1:${HTTP_PORT}/c/portal/login" 2>/dev/null || echo "failed")
  if [[ "$final_url" == *"license_activation"* ]]; then
    fail "Portal requires license activation on port ${HTTP_PORT}"
  elif [[ "$final_url" == "failed" || "$final_url" == "" ]]; then
    fail "Portal reachable over HTTP on port ${HTTP_PORT}"
  else
    ok "Portal reachable over HTTP on port ${HTTP_PORT}"
  fi

  run_check \
    "env restart passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV env restart >/dev/null"

  run_check \
    "portal check after restart passed" \
    bash -lc "cd \"$PROJECT_DIR\" && $LDEV portal check >/dev/null"

  stop_environment

  echo -e "\n${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "  ${BOLD}Total: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}\n"

  [[ $FAIL -eq 0 ]]
}

main "$@"
