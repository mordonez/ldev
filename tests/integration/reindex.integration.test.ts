import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';

import {afterEach, describe, expect, test} from 'vitest';

import {createFakeDockerBin, readFakeDockerCalls} from '../../src/testing/fake-docker.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli, spawnCli} from '../../src/testing/cli-entry.js';

type ReindexStatusPayload = {
  rows: Array<{index: string}>;
};

type ReindexTasksPayload = {
  output: string;
};

const servers: http.Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) => {
          server.close((error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve();
          });
        }),
    ),
  );
});

describe('reindex integration', () => {
  test('reindex status returns filtered journal/liferay indices', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));

    const result = await runCli(['liferay', 'reindex', 'status', '--format', 'json'], {
      cwd: repoRoot,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<ReindexStatusPayload>(result.stdout);
    expect(parsed.rows).toHaveLength(2);
    expect(parsed.rows[0].index).toBe('liferay-20097');
  }, 30000);

  test('reindex speedup-on and speedup-off update elasticsearch settings', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));

    expect((await runCli(['liferay', 'reindex', 'speedup-on'], {cwd: repoRoot})).exitCode).toBe(0);
    expect((await runCli(['liferay', 'reindex', 'speedup-off'], {cwd: repoRoot})).exitCode).toBe(0);

    expect(serverState.requests).toEqual(
      expect.arrayContaining([
        'PUT /_all/_settings {"index":{"refresh_interval":"-1"}}',
        'PUT /_all/_settings {"index":{"refresh_interval":"1s"}}',
        'POST /_refresh ',
      ]),
    );
  }, 30000);

  test('reindex tasks queries backgroundtask from postgres', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}${path.delimiter}${process.env.PATH ?? ''}`};

    const result = await runCli(['liferay', 'reindex', 'tasks', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<ReindexTasksPayload>(result.stdout);
    expect(parsed.output).toContain('RUNNING');
    const calls = await readFakeDockerCalls(fakeBinDir);
    expect(calls).toEqual(expect.arrayContaining([expect.stringContaining('backgroundtask')]));
  }, 30000);

  test('reindex watch streams snapshots before the command finishes', async () => {
    const server = await createEsServer();
    const repoRoot = await createReindexRepoFixture(getServerPort(server));

    const child = spawnCli(['liferay', 'reindex', 'watch', '--iterations', '2', '--interval', '6'], {
      cwd: repoRoot,
      env: process.env,
    });

    const stdoutChunks: string[] = [];
    child.stdout!.setEncoding('utf8');
    child.stdout!.on('data', (chunk: string) => {
      stdoutChunks.push(chunk);
    });

    await waitFor(
      () => stdoutChunks.join('').includes('[1/2]'),
      20000,
      'Expected reindex watch to emit the first snapshot before completion',
    );

    const exitCode = await new Promise<number>((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', (code) => {
        resolve(code ?? 1);
      });
    });

    expect(exitCode).toBe(0);
    const stdout = stdoutChunks.join('');
    expect(stdout).toContain('[1/2]');
    expect(stdout).toContain('[2/2]');
  }, 40000);
});

const serverState = {
  requests: [] as string[],
};

async function createEsServer(): Promise<http.Server> {
  serverState.requests = [];
  const server = http.createServer(async (request, response) => {
    await Promise.resolve();
    const chunks: Buffer[] = [];
    for await (const chunk of request) {
      const normalizedChunk = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      chunks.push(normalizedChunk);
    }
    const body = Buffer.concat(chunks).toString('utf8');
    serverState.requests.push(`${request.method} ${request.url} ${body}`);

    if (request.method === 'GET' && request.url?.startsWith('/_cat/indices')) {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify([
          {health: 'green', status: 'open', index: 'liferay-20097', 'docs.count': '100'},
          {health: 'yellow', status: 'open', index: 'journal-article', 'docs.count': '25'},
          {health: 'green', status: 'open', index: 'other-index', 'docs.count': '9'},
        ]),
      );
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

  return address.port;
}

async function createReindexRepoFixture(esPort: number): Promise<string> {
  const repoRoot = createTempDir('dev-cli-reindex-');
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  postgres:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    `COMPOSE_FILE=${['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter)}\nBIND_IP=127.0.0.1\nES_HTTP_PORT=${esPort}\nPOSTGRES_USER=liferay\nPOSTGRES_DB=liferay\n`,
  );
  return repoRoot;
}

async function waitFor(check: () => boolean, timeoutMs: number, message: string): Promise<void> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (check()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(message);
}
