import fs from 'fs-extra';
import http from 'node:http';
import path from 'node:path';

import {afterEach, describe, expect, test} from 'vitest';

import {runPerfBaseline, runPerfCheck} from '../../src/features/perf/perf.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('perf', () => {
  const servers: http.Server[] = [];

  afterEach(async () => {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
          }),
      ),
    );
    servers.length = 0;
  });

  test('baseline and check persist and compare simple latencies', async () => {
    const repoRoot = createTempDir('dev-cli-perf-');
    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(path.join(repoRoot, 'liferay'));

    const server = http.createServer((request, response) => {
      if (request.url?.includes('/_cat/indices')) {
        response.writeHead(200, {'content-type': 'application/json'});
        response.end('[]');
        return;
      }

      response.writeHead(200, {'content-type': 'application/json'});
      response.end('{}');
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    await fs.writeFile(
      path.join(repoRoot, 'docker', '.env'),
      `COMPOSE_PROJECT_NAME=demo\nCOMPOSE_FILE=docker-compose.yml:docker-compose.elasticsearch.yml\nENV_DATA_ROOT=./data/default\nBIND_IP=127.0.0.1\nLIFERAY_HTTP_PORT=${port}\nES_HTTP_PORT=${port}\n`,
    );

    const config = {
      cwd: repoRoot,
      repoRoot,
      dockerDir: path.join(repoRoot, 'docker'),
      liferayDir: path.join(repoRoot, 'liferay'),
      files: {dockerEnv: path.join(repoRoot, 'docker', '.env'), liferayProfile: null},
      liferay: {
        url: `http://127.0.0.1:${port}`,
        oauth2ClientId: '',
        oauth2ClientSecret: '',
        scopeAliases: '',
        timeoutSeconds: 5,
      },
    };

    const baseline = await runPerfBaseline(config);
    expect(baseline.snapshot.portalLatencyMs).not.toBeNull();

    const check = await runPerfCheck(config);
    expect(check.overall).toBe('ok');
    expect(check.current.portalLatencyMs).not.toBeNull();
  });
});
