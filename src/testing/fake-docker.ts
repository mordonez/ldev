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
  const dockerCmdPath = path.join(binDir, 'docker.cmd');
  const dockerScriptPath = path.join(binDir, 'docker.mjs');
  const services = options?.services ?? ['liferay', 'postgres'];
  const stateStatus = options?.stateStatus ?? 'running';
  const healthStatus = options?.healthStatus ?? 'healthy';

  await fs.writeFile(
    dockerScriptPath,
    `import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const stateFile = ${JSON.stringify(path.join(binDir, 'docker-calls.log'))};
const composeFilesLog = ${JSON.stringify(path.join(binDir, 'docker-compose-files.log'))};
const volumeDir = ${JSON.stringify(path.join(binDir, 'docker-volumes'))};
const services = ${JSON.stringify(services)};
const stateStatus = ${JSON.stringify(stateStatus)};
const healthStatus = ${JSON.stringify(healthStatus)};

fs.mkdirSync(volumeDir, {recursive: true});
fs.appendFileSync(stateFile, args.join(' ') + '\\n');
if (args[0] === 'compose') {
  fs.appendFileSync(composeFilesLog, (process.env.COMPOSE_FILE ?? '') + '\\n');
}

const input = await new Promise((resolve) => {
  if (process.stdin.isTTY) {
    resolve('');
    return;
  }
  let data = '';
  let resolved = false;
  const timeoutId = setTimeout(() => {
    if (!resolved) {
      resolved = true;
      resolve(data);
    }
  }, 75);
  
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => {
    data += chunk;
  });
  process.stdin.on('end', () => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeoutId);
      resolve(data);
    }
  });
  process.stdin.on('error', () => {
    if (!resolved) {
      resolved = true;
      clearTimeout(timeoutId);
      resolve(data);
    }
  });
});

function print(text = '') {
  process.stdout.write(text);
}

function println(text = '') {
  process.stdout.write(text + '\\n');
}

function fail(message) {
  process.stderr.write(message + '\\n');
  process.exit(1);
}

function decodeEscapes(text) {
  return text
    .replace(/\\\\n/g, '\\n')
    .replace(/\\\\r/g, '\\r')
    .replace(/\\\\t/g, '\\t')
    .replace(/\\\\b/g, '\\b');
}

if (args[0] === 'version') {
  if (args[1] === '--format') {
    println('{}');
  } else {
    println('Docker version');
  }
  process.exit(0);
}

if (args[0] === 'compose' && args[1] === 'version') {
  println('Docker Compose version v2');
  process.exit(0);
}

if (
  args[0] === 'compose' &&
  ['pull', 'up', 'stop', 'down', 'restart', 'logs', 'rm'].includes(args[1] ?? '')
) {
  if (args[1] === 'logs' && process.env.FAKE_DOCKER_LOGS_OUTPUT) {
    print(decodeEscapes(process.env.FAKE_DOCKER_LOGS_OUTPUT));
  }
  process.exit(0);
}

if (
  args[0] === 'compose' &&
  args[1] === 'exec' &&
  args[2] === '-T' &&
  args[3] === 'postgres' &&
  args[4] === 'psql'
) {
  const joined = args.join(' ');
  if (process.env.FAKE_DOCKER_PSQL_OUTPUT) {
    print(decodeEscapes(process.env.FAKE_DOCKER_PSQL_OUTPUT));
    process.exit(0);
  }
  if (joined.includes('OAuth2Application')) {
    println(joined.includes('ldev-readonly') ? 'readonly-id|readonly-secret' : 'client-id|client-secret');
    process.exit(0);
  }
  if (joined.includes('backgroundtask')) {
    println('-[ RECORD 1 ]---------');
    println('backgroundtaskid     | 123');
    println('status               | RUNNING');
    println('taskexecutorclassname| com.liferay.portal.search.internal.background.task.ReindexPortalBackgroundTaskExecutor');
    process.exit(0);
  }
  process.exit(0);
}

if (
  args[0] === 'compose' &&
  args[1] === 'exec' &&
  args[2] === '-T' &&
  args[3] === 'postgres' &&
  args[4] === 'pg_dump'
) {
  print(decodeEscapes(process.env.FAKE_DOCKER_PG_DUMP_OUTPUT ?? 'SELECT 1;\\n'));
  process.exit(0);
}

if (
  args[0] === 'compose' &&
  args[1] === 'exec' &&
  args[2] === '-T' &&
  args[3] === 'liferay' &&
  args[4] === 'sh' &&
  args[5] === '-lc'
) {
  const payload = args[6] ?? '';
  const failExecMatch = process.env.FAKE_DOCKER_FAIL_EXEC_MATCH ?? '';
  if (failExecMatch !== '' && payload.includes(failExecMatch)) {
    fail('simulated compose exec failure for ' + failExecMatch);
  }
  const commandText = payload + '\\n' + input;
  if (payload.includes('lb -s')) {
    print(decodeEscapes(process.env.FAKE_DOCKER_LB_OUTPUT ?? '42|Active|    1|com.test.bundle\\n'));
    process.exit(0);
  }
  if (
    commandText.includes('lb | grep') ||
    input.trim() === 'lb' ||
    commandText.includes('\\nlb\\n')
  ) {
    println('42|Active|    1|com.test.bundle');
    process.exit(0);
  }
  if (commandText.includes('help ldev:oauthInstall') || commandText.includes('help ldev:adminUnblock')) {
    println('oauthInstall');
    println('adminUnblock');
    process.exit(0);
  }
  if (commandText.includes('diag 42')) {
    println('No unresolved constraints');
    process.exit(0);
  }
  if (commandText.includes('ldev:oauthInstall')) {
    println('companyId=20116');
    println('companyWebId=liferay.com');
    println('userId=20123');
    println('userEmail=test@liferay.com');
    println('externalReferenceCode=ldev');
    println('LIFERAY_CLI_OAUTH2_CLIENT_ID=client-id');
    println('LIFERAY_CLI_OAUTH2_CLIENT_SECRET=client-secret');
    println('LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID=readonly-id');
    println('LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET=readonly-secret');
    const execExitCode = parseInt(process.env.FAKE_DOCKER_EXEC_SH_EXIT_CODE ?? '0', 10);
    process.exit(execExitCode);
  }
  if (commandText.includes('ldev:adminUnblock')) {
    println('companyId=20116');
    println('companyWebId=liferay.com');
    println('userId=20123');
    println('userEmail=admin@liferay.com');
    println('passwordReset=false');
    process.exit(0);
  }
  process.exit(0);
}

if (args[0] === 'compose' && args[1] === 'exec' && args[2] === 'liferay' && ['generate_thread_dump.sh', 'generate_heap_dump.sh'].includes(args[3] ?? '')) {
  process.exit(0);
}

if (args[0] === 'run' && args[1] === '--rm') {
  let target = '';
  for (const arg of args) {
    if (arg.endsWith(':/target:ro')) target = arg.slice(0, -':/target:ro'.length);
    if (arg.endsWith(':/target')) target = arg.slice(0, -':/target'.length);
  }
  if (process.env.FAKE_DOCKER_TARGET_LIST_RESULT === 'nonempty') {
    println('/target/file');
    process.exit(0);
  }
  if (process.env.FAKE_DOCKER_TARGET_LIST_RESULT === 'empty') {
    process.exit(0);
  }
  if (target && fs.existsSync(target)) {
    const first = fs.readdirSync(target)[0];
    if (first) {
      println('/target/' + first);
    }
  }
  process.exit(0);
}

if (args[0] === 'volume' && args[1] === 'rm') {
  if (process.env.FAKE_DOCKER_VOLUME_RM_REQUIRES_COMPOSE_RM === '1') {
    const calls = fs.existsSync(stateFile) ? fs.readFileSync(stateFile, 'utf8') : '';
    if (!/^compose rm .* postgres$/m.test(calls)) {
      fail('volume is in use');
    }
  }
  fs.rmSync(path.join(volumeDir, (args[2] ?? '') + '.device'), {force: true});
  fs.rmSync(path.join(volumeDir, (args[2] ?? '') + '.type'), {force: true});
  process.exit(0);
}

if (args[0] === 'volume' && args[1] === 'inspect') {
  const volume = args[2] ?? '';
  const format = args[4] ?? '';
  const deviceFile = path.join(volumeDir, volume + '.device');
  const typeFile = path.join(volumeDir, volume + '.type');
  if (!fs.existsSync(deviceFile)) {
    process.exit(1);
  }
  if (format === '{{index .Options "type"}}') {
    print(fs.readFileSync(typeFile, 'utf8'));
    process.exit(0);
  }
  if (format === '{{index .Options "device"}}') {
    print(fs.readFileSync(deviceFile, 'utf8'));
    process.exit(0);
  }
  process.exit(0);
}

if (args[0] === 'volume' && args[1] === 'create') {
  const volume = args[args.length - 1] ?? '';
  if (process.env.FAKE_DOCKER_VOLUME_CREATE_FAIL === '1') {
    fail('simulated volume create failure');
  }
  let device = '';
  let type = 'none';
  for (const arg of args) {
    if (arg.startsWith('device=')) device = arg.slice('device='.length);
    if (arg.startsWith('type=')) type = arg.slice('type='.length);
  }
  fs.writeFileSync(path.join(volumeDir, volume + '.device'), device + '\\n');
  fs.writeFileSync(path.join(volumeDir, volume + '.type'), type + '\\n');
  println(volume);
  process.exit(0);
}

if (args[0] === 'rm' && args[1] === '-f') process.exit(0);
if (args[0] === 'ps' && args[1] === '-q') {
  println('liferay-container');
  process.exit(0);
}
if (args[0] === 'ps' && ['--format', '-aq'].includes(args[1] ?? '')) process.exit(0);

if (args[0] === 'compose' && args[1] === 'config' && args[2] === '--services') {
  println(services.join('\\n'));
  process.exit(0);
}

if (args[0] === 'compose' && args[1] === 'ps' && args[2] === '-q') {
  if (args[3] === 'liferay') println('liferay-container');
  else if (args[3] === 'postgres') println('postgres-container');
  process.exit(0);
}

if (args[0] === 'inspect' && args[1] === '-f') {
  const format = args[2] ?? '';
  const container = args[3] ?? '';
  if (format === '{{.State.Status}}') {
    println(stateStatus);
    process.exit(0);
  }
  if (format === '{{if .State.Health}}{{.State.Health.Status}}{{end}}') {
    if (container === 'liferay-container') {
      println(healthStatus ?? '');
    }
    process.exit(0);
  }
}

fail('unsupported docker call: ' + args.join(' '));
`,
    {mode: 0o755},
  );

  await fs.writeFile(
    dockerPath,
    `#!/usr/bin/env bash
exec node "$(dirname "$0")/docker.mjs" "$@"
`,
    {mode: 0o755},
  );

  await fs.writeFile(
    dockerCmdPath,
    `@echo off
node "%~dp0docker.mjs" %*
`,
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
