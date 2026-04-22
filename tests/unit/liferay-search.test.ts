import fs from 'fs-extra';
import path from 'node:path';

import {afterEach, describe, expect, test, vi} from 'vitest';

import * as dockerPlatform from '../../src/core/platform/docker.js';
import {
  runLiferaySearchIndices,
  runLiferaySearchMappings,
  runLiferaySearchQuery,
} from '../../src/features/liferay/liferay-search.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('liferay-search', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  test('lists indices', async () => {
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{index: 'liferay-1', health: 'green', status: 'open', 'docs.count': 10}]), {
        status: 200,
      }),
    ) as typeof fetch;

    const result = await runLiferaySearchIndices(
      makeConfig({composeFile: ['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter)}),
    );
    expect(result.rows[0]?.index).toBe('liferay-1');
  });

  test('loads mappings for one index', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({foo: {mappings: {}}}), {status: 200})) as typeof fetch;

    const result = await runLiferaySearchMappings(
      makeConfig({composeFile: ['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter)}),
      {index: 'foo'},
    );
    expect(result.index).toBe('foo');
    expect(result.mappings).toHaveProperty('foo');
  });

  test('executes a query against one index', async () => {
    global.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({hits: {total: {value: 2}, hits: []}}), {status: 200}),
      ) as typeof fetch;

    const result = await runLiferaySearchQuery(
      makeConfig({composeFile: ['docker-compose.yml', 'docker-compose.elasticsearch.yml'].join(path.delimiter)}),
      {index: 'foo', query: 'bar'},
    );
    expect((result.hits.hits as {total: {value: number}}).total.value).toBe(2);
  });

  test('lists indices through the internal sidecar when no external elasticsearch profile is configured', async () => {
    const dockerSpy = vi.spyOn(dockerPlatform, 'runDockerCompose').mockResolvedValue({
      command: 'docker compose exec -T liferay curl',
      stdout: '[{"index":"liferay-sidecar","health":"green","status":"open","docs.count":7}]\n__LDEV_STATUS__200',
      stderr: '',
      exitCode: 0,
      ok: true,
    });

    const result = await runLiferaySearchIndices(makeConfig({composeFile: 'docker-compose.yml'}));

    expect(result.esUrl).toContain('9201');
    expect(result.rows[0]?.index).toBe('liferay-sidecar');
    expect(dockerSpy).toHaveBeenCalledTimes(1);
    const [cwd, args, options] =
      dockerSpy.mock.calls[0] ??
      (() => {
        throw new Error('Expected docker command call');
      })();
    expect(path.basename(cwd)).toBe('docker');
    expect(args).toEqual(expect.arrayContaining(['exec', '-T', 'liferay', 'curl']));
    expect(options).toEqual(expect.objectContaining({reject: false}));
  });
});

function makeConfig(options?: {composeFile?: string}) {
  const repoRoot = createTempDir('ldev-search-unit-');
  fs.ensureDirSync(path.join(repoRoot, 'docker'));
  fs.ensureDirSync(path.join(repoRoot, 'liferay'));
  fs.writeFileSync(
    path.join(repoRoot, 'docker', '.env'),
    `${options?.composeFile ? `COMPOSE_FILE=${options.composeFile}\n` : ''}BIND_IP=127.0.0.1\nES_HTTP_PORT=9200\n`,
  );

  return {
    cwd: repoRoot,
    repoRoot,
    dockerDir: path.join(repoRoot, 'docker'),
    liferayDir: path.join(repoRoot, 'liferay'),
    files: {dockerEnv: path.join(repoRoot, 'docker', '.env'), liferayProfile: null},
    liferay: {
      url: 'http://localhost:8080',
      oauth2ClientId: '',
      oauth2ClientSecret: '',
      scopeAliases: '',
      timeoutSeconds: 5,
    },
  };
}
