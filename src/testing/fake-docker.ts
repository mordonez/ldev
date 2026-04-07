import fs from 'fs-extra';
import path from 'node:path';

import {createTempDir} from './temp-repo.js';

export async function createFakeDockerBin(options?: {
  stateStatus?: string;
  healthStatus?: string | null;
  services?: string[];
}): Promise<string> {
  const binDir = createTempDir('dev-cli-fake-docker-bin-');
  const dockerPath = path.join(binDir, 'docker');
  const services = options?.services ?? ['liferay', 'postgres'];
  const stateStatus = options?.stateStatus ?? 'running';
  const healthStatus = options?.healthStatus ?? 'healthy';

  await fs.writeFile(
    dockerPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_FILE="${binDir}/docker-calls.log"
VOLUME_DIR="${binDir}/docker-volumes"
mkdir -p "$VOLUME_DIR"
printf '%s\\n' "$*" >> "$STATE_FILE"
if [[ "$1" == "compose" ]]; then
  printf '%s\\n' "\${COMPOSE_FILE:-}" >> "${binDir}/docker-compose-files.log"
fi
if [[ "$1" == "version" ]]; then
  if [[ "\${2:-}" == "--format" ]]; then
    printf '{}\\n'
  else
    printf 'Docker version\\n'
  fi
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "version" ]]; then
  printf 'Docker Compose version v2\\n'
  exit 0
fi
if [[ "$1" == "compose" && ("\${2:-}" == "pull" || "\${2:-}" == "up" || "\${2:-}" == "stop" || "\${2:-}" == "down" || "\${2:-}" == "restart" || "\${2:-}" == "logs") ]]; then
  if [[ "\${2:-}" == "logs" && -n "\${FAKE_DOCKER_LOGS_OUTPUT:-}" ]]; then
    printf '%b' "\${FAKE_DOCKER_LOGS_OUTPUT}"
  fi
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "exec" && "\${3:-}" == "-T" && "\${4:-}" == "postgres" && "\${5:-}" == "psql" ]]; then
  if [[ -n "\${FAKE_DOCKER_PSQL_OUTPUT:-}" ]]; then
    printf '%b' "\${FAKE_DOCKER_PSQL_OUTPUT}"
    exit 0
  fi
  if [[ "$*" == *"OAuth2Application"* ]]; then
    if [[ "$*" == *"ldev-readonly"* ]]; then
      printf 'readonly-id|readonly-secret\\n'
      exit 0
    fi
    printf 'client-id|client-secret\\n'
    exit 0
  fi
  if [[ "$*" == *"backgroundtask"* && "$*" == *"Reindex"* ]]; then
    printf '-[ RECORD 1 ]---------\\n'
    printf 'backgroundtaskid     | 123\\n'
    printf 'status               | RUNNING\\n'
    printf 'taskexecutorclassname| com.liferay.portal.search.internal.background.task.ReindexPortalBackgroundTaskExecutor\\n'
    exit 0
  fi
  cat >/dev/null || true
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "exec" && "\${3:-}" == "-T" && "\${4:-}" == "postgres" && "\${5:-}" == "pg_dump" ]]; then
  printf '%b' "\${FAKE_DOCKER_PG_DUMP_OUTPUT:-SELECT 1;\\n}"
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "exec" && "\${3:-}" == "-T" && "\${4:-}" == "liferay" && "\${5:-}" == "sh" && "\${6:-}" == "-lc" ]]; then
  payload="\${7:-}"
  if [[ "$payload" == *"lb -s"* ]]; then
    if [[ -n "\${FAKE_DOCKER_LB_OUTPUT:-}" ]]; then
      printf '%b' "\${FAKE_DOCKER_LB_OUTPUT}"
    else
      printf '42|Active|    1|com.test.bundle\\n'
    fi
    exit 0
  fi
  input="$(cat || true)"
  if [[ "$input" == *"lb | grep"* ]]; then
    printf '42|Active|    1|com.test.bundle\\n'
    exit 0
  fi
  if [[ "$input" == *"help ldev:oauthInstall"* || "$input" == *"help ldev:adminUnblock"* ]]; then
    printf 'oauthInstall\\nadminUnblock\\n'
    exit 0
  fi
  if [[ "$input" == *"diag 42"* ]]; then
    printf 'No unresolved constraints\\n'
    exit 0
  fi
  if [[ "$input" == *"ldev:oauthInstall"* ]]; then
    printf 'companyId=20116\\n'
    printf 'companyWebId=liferay.com\\n'
    printf 'userId=20123\\n'
    printf 'userEmail=test@liferay.com\\n'
    printf 'externalReferenceCode=ldev\\n'
    printf 'LIFERAY_CLI_OAUTH2_CLIENT_ID=client-id\\n'
    printf 'LIFERAY_CLI_OAUTH2_CLIENT_SECRET=client-secret\\n'
    printf 'LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID=readonly-id\\n'
    printf 'LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET=readonly-secret\\n'
    exit 0
  fi
  if [[ "$input" == *"ldev:adminUnblock"* ]]; then
    printf 'companyId=20116\\n'
    printf 'companyWebId=liferay.com\\n'
    printf 'userId=20123\\n'
    printf 'userEmail=admin@liferay.com\\n'
    printf 'passwordReset=false\\n'
    exit 0
  fi
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "exec" && "\${3:-}" == "liferay" && ("\${4:-}" == "generate_thread_dump.sh" || "\${4:-}" == "generate_heap_dump.sh") ]]; then
  exit 0
fi
if [[ "$1" == "run" && "\${2:-}" == "--rm" ]]; then
  target=""
  args=("$@")
  for arg in "\${args[@]}"; do
    case "$arg" in
      *:/target:ro) target="\${arg%:/target:ro}" ;;
      *:/target) target="\${arg%:/target}" ;;
    esac
  done
  if [[ "\${FAKE_DOCKER_TARGET_LIST_RESULT:-}" == "nonempty" ]]; then
    printf '/target/file\\n'
    exit 0
  fi
  if [[ "\${FAKE_DOCKER_TARGET_LIST_RESULT:-}" == "empty" ]]; then
    exit 0
  fi
  if [[ -n "$target" ]] && find "$target" -mindepth 1 -maxdepth 1 -print -quit >/dev/null 2>&1; then
    find "$target" -mindepth 1 -maxdepth 1 -print -quit 2>/dev/null | sed "s|$target|/target|"
  fi
  exit 0
fi
if [[ "$1" == "volume" && "\${2:-}" == "rm" ]]; then
  rm -f "$VOLUME_DIR/\${3:-}.device" "$VOLUME_DIR/\${3:-}.type"
  exit 0
fi
if [[ "$1" == "volume" && "\${2:-}" == "inspect" ]]; then
  volume="\${3:-}"
  format="\${5:-}"
  device_file="$VOLUME_DIR/$volume.device"
  type_file="$VOLUME_DIR/$volume.type"
  if [[ ! -f "$device_file" ]]; then
    exit 1
  fi
  if [[ "$format" == "{{index .Options \\"type\\"}}" ]]; then
    cat "$type_file"
    exit 0
  fi
  if [[ "$format" == "{{index .Options \\"device\\"}}" ]]; then
    cat "$device_file"
    exit 0
  fi
  exit 0
fi
if [[ "$1" == "volume" && "\${2:-}" == "create" ]]; then
  args=("$@")
  volume="\${args[\${#args[@]}-1]}"
  device=""
  type="none"
  for arg in "\${args[@]}"; do
    case "$arg" in
      device=*) device="\${arg#device=}" ;;
      type=*) type="\${arg#type=}" ;;
    esac
  done
  printf '%s\\n' "$device" > "$VOLUME_DIR/$volume.device"
  printf '%s\\n' "$type" > "$VOLUME_DIR/$volume.type"
  printf '%s\\n' "$volume"
  exit 0
fi
if [[ "$1" == "rm" && "\${2:-}" == "-f" ]]; then
  exit 0
fi
if [[ "$1" == "ps" && "\${2:-}" == "--format" ]]; then
  exit 0
fi
if [[ "$1" == "ps" && "\${2:-}" == "-aq" ]]; then
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "config" && "\${3:-}" == "--services" ]]; then
  printf '${services.join('\\n')}\\n'
  exit 0
fi
if [[ "$1" == "compose" && "\${2:-}" == "ps" && "\${3:-}" == "-q" ]]; then
  if [[ "\${4:-}" == "liferay" ]]; then
    printf 'liferay-container\\n'
  elif [[ "\${4:-}" == "postgres" ]]; then
    printf 'postgres-container\\n'
  fi
  exit 0
fi
if [[ "$1" == "inspect" && "\${2:-}" == "-f" ]]; then
  format="\${3:-}"
  container="\${4:-}"
  if [[ "$format" == "{{.State.Status}}" ]]; then
    printf '${stateStatus}\\n'
    exit 0
  fi
  if [[ "$format" == "{{if .State.Health}}{{.State.Health.Status}}{{end}}" ]]; then
    if [[ "$container" == "liferay-container" ]]; then
      ${healthStatus === null ? "printf '\\n'" : `printf '${healthStatus}\\n'`}
    fi
    exit 0
  fi
fi
printf 'unsupported docker call: %s\\n' "$*" >&2
exit 1
`,
    {mode: 0o755},
  );

  return binDir;
}

export async function readFakeDockerComposeFiles(binDir: string): Promise<string[]> {
  const file = path.join(binDir, 'docker-compose-files.log');
  if (!(await fs.pathExists(file))) return [];
  return (await fs.readFile(file, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

export async function readFakeDockerCalls(binDir: string): Promise<string[]> {
  const file = path.join(binDir, 'docker-calls.log');
  if (!(await fs.pathExists(file))) {
    return [];
  }

  return (await fs.readFile(file, 'utf8'))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}
