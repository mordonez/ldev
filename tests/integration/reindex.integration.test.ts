import fs from 'fs-extra';
import http from 'node:http';
import type {AddressInfo} from 'node:net';
import path from 'node:path';

import {afterEach, describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = path.join(CLI_CWD, 'src', 'index.ts');

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  })));
});

describe('reindex integration', () => {
  test('reindex status returns filtered journal/liferay indices', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'reindex', 'status', '--format', 'json'], {cwd: repoRoot});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].index).toBe('liferay-20097');
  }, 20000);

  test('reindex speedup-on and speedup-off update elasticsearch settings', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));

    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'reindex', 'speedup-on'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'reindex', 'speedup-off'], {cwd: repoRoot})).exitCode).toBe(0);

    expect(serverState.requests).toEqual(expect.arrayContaining([
      'PUT /_all/_settings {"index":{"refresh_interval":"-1"}}',
      'PUT /_all/_settings {"index":{"refresh_interval":"1s"}}',
      'POST /_refresh ',
    ]));
  }, 20000);

  test('reindex tasks queries backgroundtask from postgres', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));
    const fakeBinDir = await createReindexTasksDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'reindex', 'tasks', '--format', 'json'], {cwd: repoRoot, env});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.output).toContain('RUNNING');
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining([expect.stringContaining('backgroundtask')]));
  }, 20000);
});

const serverState = {
  requests: [] as string[],
};

async function createEsServer(): Promise<http.Server> {
  serverState.requests = [];
  const server = http.createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      chunks.push(Buffer.from(chunk));
    }
    const body = Buffer.concat(chunks).toString('utf8');
    serverState.requests.push(`${request.method} ${request.url} ${body}`);

    if (request.method === 'GET' && request.url?.startsWith('/_cat/indices')) {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify([
        {health: 'green', status: 'open', index: 'liferay-20097', 'docs.count': '100'},
        {health: 'yellow', status: 'open', index: 'journal-article', 'docs.count': '25'},
        {health: 'green', status: 'open', index: 'other-index', 'docs.count': '9'},
      ]));
      return;
    }

    if (request.method === 'PUT' && request.url === '/_all/_settings') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({acknowledged: true}));
      return;
    }

    if (request.method === 'POST' && request.url === '/_refresh') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({_shards: {successful: 1}}));
      return;
    }

    response.statusCode = 404;
    response.end('not found');
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  servers.push(server);
  return server;
}

function getServerPort(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Expected TCP server address');
  }

  return (address as AddressInfo).port;
}

async function createReindexRepoFixture(esPort: number): Promise<string> {
  const repoRoot = createTempDir('dev-cli-reindex-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    `BIND_IP=127.0.0.1\nES_HTTP_PORT=${esPort}\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n`,
  );
  return repoRoot;
}

async function createReindexTasksDockerBin(): Promise<string> {
  const binDir = createTempDir('dev-cli-reindex-tasks-bin-');
  const dockerPath = path.join(binDir, 'docker');
  await fs.writeFile(
    dockerPath,
    `#!/usr/bin/env bash
set -euo pipefail
STATE_FILE="${binDir}/docker-calls.log"
printf '%s\\n' "$*" >> "$STATE_FILE"
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
if [[ "$1" == "compose" && "\${2:-}" == "exec" && "\${3:-}" == "-T" && "\${4:-}" == "postgres" && "\${5:-}" == "psql" ]]; then
  printf '%s\\n' '-[ RECORD 1 ]---------' 'backgroundtaskid     | 123' 'status               | RUNNING' 'taskexecutorclassname| com.liferay.portal.search.internal.background.task.ReindexPortalBackgroundTaskExecutor'
  exit 0
fi
printf 'unsupported docker call: %s\\n' "$*" >&2
exit 1
`,
    {mode: 0o755},
  );

  return binDir;
}
