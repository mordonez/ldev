#!/usr/bin/env bash
# smoke-test-compose-profiles.sh
#
# Validates the three ldev compose profile scenarios end-to-end:
#
#   1. Solo DXP    — ldev project init → ldev setup → ldev start
#   2. DXP + ES    — ldev project init → ldev setup --with elasticsearch → ldev start
#   3. Full stack  — ldev project init → ldev setup --with elasticsearch --with postgres → ldev start
#
# Prerequisites:
#   - Docker running
#   - ACTIVATION_KEY env var or first argument pointing to a DXP activation key XML
#
# Usage:
#   ./scripts/smoke-test-compose-profiles.sh [/path/to/activation-key.xml]
#   ACTIVATION_KEY=/path/to/key.xml npm run smoke

set -euo pipefail

# ─── Config ────────────────────────────────────────────────────────────────────

LDEV_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LDEV="npx tsx ${LDEV_ROOT}/src/index.ts"
ACTIVATION_KEY="${1:-${ACTIVATION_KEY:-}}"
# Conservative JVM opts: smoke test runs one scenario at a time
JVM_OPTS="-Xms1g -Xmx2g -XX:+UseG1GC -XX:MaxGCPauseMillis=200 -Djava.net.preferIPv4Stack=true"
# Seconds to wait for Liferay healthy
HEALTH_TIMEOUT=600
TEST_BASE="/tmp/ldev-smoke-$$"

PASS=0
FAIL=0
declare -a RESULTS=()

# ─── Colors ────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; BOLD='\033[1m'; NC='\033[0m'
ok()   { echo -e "  ${GREEN}✓ $*${NC}"; }
fail() { echo -e "  ${RED}✗ $*${NC}"; }
warn() { echo -e "  ${YELLOW}! $*${NC}"; }
log()  { echo -e "  $*"; }

# ─── Preflight ─────────────────────────────────────────────────────────────────

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

  # RAM check (macOS vm_stat / Linux free)
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

# ─── Scenario ──────────────────────────────────────────────────────────────────

run_scenario() {
  local label="$1"
  local name="$2"       # compose project name (unique per scenario)
  local http_port="$3"
  local es_port="${4:-}"
  local pg_port="${5:-}"
  shift 5
  local setup_args=("$@")   # extra args passed to ldev setup (e.g. --with elasticsearch)

  local dir="${TEST_BASE}/${name}"
  local scenario_pass=0
  local scenario_fail=0

  echo -e "${BOLD}━━━ Scenario: ${label} ━━━${NC}"

  # 1. ldev project init (--commit so git HEAD exists for any build tooling)
  log "ldev project init --name ${name} --dir ${dir} --commit"
  if ! $LDEV project init --name "$name" --dir "$dir" --commit 2>&1; then
    fail "project init failed"
    RESULTS+=("${label}: FAIL (project init)")
    FAIL=$((FAIL + 1))
    return
  fi
  ok "project init complete"

  # Override .env values for isolated test (unique ports + smaller JVM)
  local env_file="${dir}/docker/.env"
  {
    echo "LIFERAY_HTTP_PORT=${http_port}"
    echo "LIFERAY_DEBUG_PORT=$((http_port + 1000))"
    echo "GOGO_PORT=$((http_port + 2000))"
    [[ -n "$pg_port"  ]] && echo "POSTGRES_PORT=${pg_port}"
    [[ -n "$es_port"  ]] && echo "ES_HTTP_PORT=${es_port}"
    echo "COMPOSE_PROJECT_NAME=${name}"
    echo "DOCLIB_VOLUME_NAME=${name}-doclib"
    echo "LIFERAY_JVM_OPTS=\"${JVM_OPTS}\""
  } >> "$env_file"

  # 2. ldev setup [--with ...]
  log "ldev setup --skip-pull ${setup_args[*]+"${setup_args[*]}"}"
  if ! (cd "$dir" && $LDEV setup --skip-pull "${setup_args[@]+"${setup_args[@]}"}" 2>&1); then
    fail "setup failed"
    RESULTS+=("${label}: FAIL (setup)")
    FAIL=$((FAIL + 1))
    return
  fi
  ok "setup complete"

  # Assert COMPOSE_FILE written when --with args provided
  if [[ ${#setup_args[@]} -gt 0 ]]; then
    local compose_file
    compose_file=$(grep "^COMPOSE_FILE=" "$env_file" | cut -d= -f2- || true)
    if [[ -n "$compose_file" ]]; then
      ok "COMPOSE_FILE=${compose_file}"
      scenario_pass=$((scenario_pass + 1))
    else
      fail "COMPOSE_FILE not written to .env"
      scenario_fail=$((scenario_fail + 1))
    fi
  fi

  # Assert ES config copied when --with elasticsearch
  if printf '%s\n' "${setup_args[@]+"${setup_args[@]}"}" | grep -q "elasticsearch"; then
    local es_config="${dir}/liferay/configs/dockerenv/osgi/configs/com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config"
    if [[ -f "$es_config" ]]; then
      ok "ElasticsearchConfiguration.config copied"
      scenario_pass=$((scenario_pass + 1))
    else
      fail "ElasticsearchConfiguration.config NOT copied"
      scenario_fail=$((scenario_fail + 1))
    fi
  fi

  # 3. ldev start
  log "ldev start --activation-key-file ... --timeout ${HEALTH_TIMEOUT}"
  if ! (cd "$dir" && $LDEV start \
      --activation-key-file "$ACTIVATION_KEY" \
      --timeout "$HEALTH_TIMEOUT" 2>&1); then
    fail "start failed or timed out"
    RESULTS+=("${label}: FAIL (start)")
    FAIL=$((FAIL + scenario_fail + 1))
    _stop "$dir"
    return
  fi
  ok "Liferay healthy"
  scenario_pass=$((scenario_pass + 1))

  # 4. HTTP connectivity + license check (follow redirects, reject license_activation)
  local final_url
  final_url=$(curl -fsS --max-time 15 -L -w "%{url_effective}" -o /dev/null \
    "http://127.0.0.1:${http_port}/c/portal/login" 2>/dev/null || echo "failed")
  if [[ "$final_url" == *"license_activation"* ]]; then
    fail "Portal requires license activation on port ${http_port} (activation key not loaded)"
    scenario_fail=$((scenario_fail + 1))
  elif [[ "$final_url" == "failed" || "$final_url" == "" ]]; then
    fail "HTTP unreachable on port ${http_port}"
    scenario_fail=$((scenario_fail + 1))
  else
    ok "Portal reachable on port ${http_port} → ${final_url}"
    scenario_pass=$((scenario_pass + 1))
  fi

  # 5. Elasticsearch API (when applicable)
  if [[ -n "$es_port" ]]; then
    local es_status
    es_status=$(curl -fsS --max-time 5 \
      "http://127.0.0.1:${es_port}/_cat/health?h=status" 2>/dev/null \
      | tr -d '[:space:]' || echo "unreachable")
    if [[ "$es_status" == "green" ]]; then
      ok "Elasticsearch ${es_status} on port ${es_port}"
      scenario_pass=$((scenario_pass + 1))
    else
      fail "Elasticsearch ${es_status} on port ${es_port}"
      scenario_fail=$((scenario_fail + 1))
    fi
  fi

  # 6. PostgreSQL (when applicable)
  if [[ -n "$pg_port" ]]; then
    local pg_count
    pg_count=$(docker exec "${name}-postgres" \
      psql -U liferay -d liferay -t -c "SELECT count(*) FROM counter;" 2>/dev/null \
      | tr -d '[:space:]' || echo "0")
    if [[ "${pg_count:-0}" -gt 0 ]]; then
      ok "PostgreSQL: ${pg_count} counters on port ${pg_port}"
      scenario_pass=$((scenario_pass + 1))
    else
      fail "PostgreSQL: counter table empty or unreachable"
      scenario_fail=$((scenario_fail + 1))
    fi
  fi

  # 7. ldev stop
  _stop "$dir"

  PASS=$((PASS + scenario_pass))
  FAIL=$((FAIL + scenario_fail))

  if [[ $scenario_fail -eq 0 ]]; then
    RESULTS+=("${GREEN}${label}: PASS (${scenario_pass} checks)${NC}")
  else
    RESULTS+=("${RED}${label}: FAIL (${scenario_pass} passed, ${scenario_fail} failed)${NC}")
  fi
  echo ""
}

_stop() {
  local dir="$1"
  log "ldev stop"
  (cd "$dir" && $LDEV stop 2>&1) || true
}

# ─── Cleanup ───────────────────────────────────────────────────────────────────

cleanup() {
  echo ""
  log "Cleaning up ..."
  docker ps --filter "name=lsmoke-" -q | xargs -r docker stop >/dev/null 2>&1 || true
  docker ps -a --filter "name=lsmoke-" -q | xargs -r docker rm >/dev/null 2>&1 || true
  docker volume ls --filter "name=lsmoke-" -q | xargs -r docker volume rm >/dev/null 2>&1 || true
  rm -rf "$TEST_BASE"
}
trap cleanup EXIT

# ─── Main ──────────────────────────────────────────────────────────────────────

main() {
  echo -e "\n${BOLD}╔══════════════════════════════════════════════════════╗${NC}"
  echo -e "${BOLD}║  ldev compose profiles — end-to-end smoke test      ║${NC}"
  echo -e "${BOLD}╚══════════════════════════════════════════════════════╝${NC}"

  preflight
  mkdir -p "$TEST_BASE"

  # Scenarios run sequentially to avoid OOM (each Liferay needs ~2 GB)
  run_scenario \
    "Solo DXP (H2 + embedded search)" \
    "lsmoke-solo" 8081 "" ""
    # no --with args

  run_scenario \
    "DXP + Elasticsearch" \
    "lsmoke-es" 8082 9202 "" \
    --with elasticsearch

  run_scenario \
    "DXP + Elasticsearch + PostgreSQL" \
    "lsmoke-full" 8083 9203 5435 \
    --with elasticsearch --with postgres

  # ─── Summary ─────────────────────────────────────────────────────────────────
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  for r in "${RESULTS[@]}"; do
    echo -e "  ${r}"
  done
  echo ""
  echo -e "  ${BOLD}Total: ${GREEN}${PASS} passed${NC}  ${RED}${FAIL} failed${NC}${BOLD}${NC}"
  echo -e "${BOLD}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""

  [[ $FAIL -eq 0 ]]
}

main "$@"
