import {describe, expect, test} from 'vitest';

import type {DoctorContext} from '../../src/features/doctor/doctor-types.js';
import {collectDoctorProbeSections} from '../../src/features/doctor/doctor-probes.js';

describe('collectDoctorProbeSections', () => {
  test('marks runtime as skipped when docker daemon is unavailable', async () => {
    const ctx = makeDoctorContext({
      tools: {
        ...makeDoctorContext().tools,
        dockerDaemon: {status: 'warn', available: false, version: null, reason: 'command-failed'},
      },
    });

    const result = await collectDoctorProbeSections(ctx, ['basic', 'runtime']);

    expect(result.runtime?.status).toBe('skip');
    expect(result.checks).toContainEqual(
      expect.objectContaining({id: 'runtime-services', scope: 'runtime', status: 'skip'}),
    );
  });

  test('marks portal unreachable as warn and skips oauth when HTTP probe fails', async () => {
    const ctx = makeDoctorContext();

    const result = await collectDoctorProbeSections(ctx, ['basic', 'portal'], {
      dependencies: {
        fetchImpl: () => Promise.reject(new Error('connection refused')),
      },
    });

    expect(result.portal?.status).toBe('warn');
    expect(result.portal?.http.status).toBe('warn');
    expect(result.portal?.oauth?.status).toBe('skip');
    expect(result.checks).toContainEqual(expect.objectContaining({id: 'portal-http', scope: 'portal', status: 'warn'}));
  });

  test('fails the oauth portal probe when configured credentials are invalid', async () => {
    const ctx = makeDoctorContext();

    const result = await collectDoctorProbeSections(ctx, ['basic', 'portal'], {
      dependencies: {
        fetchImpl: () => Promise.resolve(new Response('', {status: 302})),
        createOAuthTokenClient: () => ({
          fetchClientCredentialsToken: () => Promise.reject(new Error('invalid_client')),
        }),
      },
    });

    expect(result.portal?.http.status).toBe('pass');
    expect(result.portal?.oauth?.status).toBe('fail');
    expect(result.checks).toContainEqual(
      expect.objectContaining({id: 'portal-oauth', scope: 'portal', status: 'fail'}),
    );
  });

  test('summarizes problematic OSGi bundles when gogo is reachable', async () => {
    const ctx = makeDoctorContext();

    const result = await collectDoctorProbeSections(ctx, ['basic', 'osgi'], {
      dependencies: {
        runGogoCommand: () =>
          Promise.resolve(
            ['42|Active   |    1|com.example.ok (1.0.0)', '43|Resolved |    1|com.example.bad (1.0.0)'].join('\n'),
          ),
      },
    });

    expect(result.osgi?.status).toBe('warn');
    expect(result.osgi?.problematicBundles).toEqual([{id: '43', state: 'RESOLVED', name: 'com.example.bad (1.0.0)'}]);
    expect(result.checks).toContainEqual(expect.objectContaining({id: 'osgi-gogo', scope: 'osgi', status: 'warn'}));
  });
});

function makeDoctorContext(overrides?: Partial<DoctorContext>): DoctorContext {
  return {
    project: {
      cwd: '/repo',
      projectType: 'ldev-native',
      repo: {
        root: '/repo',
        inRepo: true,
        dockerDir: '/repo/docker',
        liferayDir: '/repo/liferay',
      },
      files: {
        dockerEnv: '/repo/docker/.env',
        liferayProfile: '/repo/.liferay-cli.yml',
        liferayLocalProfile: '/repo/.liferay-cli.local.yml',
      },
      env: {
        bindIp: 'localhost',
        httpPort: '8080',
        portalUrl: 'http://localhost:8080',
        composeProjectName: 'labweb',
        dataRoot: '/repo/docker/data/default',
      },
      inventory: {
        liferay: {
          product: 'dxp-2026.q1.0',
          image: 'liferay/dxp:2026.q1.0-lts',
          version: 'dxp-2026.q1.0',
          jvmOptsConfigured: true,
        },
        runtime: {
          composeFiles: ['docker-compose.yml'],
          services: ['liferay', 'postgres'],
          ports: {http: '8080', debug: null, gogo: '11311', postgres: '5432', elasticsearch: null},
        },
        local: {
          modules: {count: 1, sample: ['sample-module']},
          themes: {count: 0, sample: []},
          clientExtensions: {count: 0, sample: []},
          wars: {count: 0, sample: []},
          deployArtifacts: {count: 0, sample: []},
        },
        resources: {
          structures: {path: 'liferay/resources/journal/structures', exists: true, count: 1},
          templates: {path: 'liferay/resources/journal/templates', exists: true, count: 1},
          adts: {path: 'liferay/resources/journal/adts', exists: false, count: 0},
          fragments: {path: 'liferay/resources/fragments', exists: false, count: 0},
          migrations: {path: 'liferay/resources/migrations', exists: false, count: 0},
        },
      },
      values: {
        dockerEnv: {},
        profile: {},
        localProfile: {},
      },
      workspace: {
        product: null,
      },
      paths: {
        structures: 'liferay/resources/journal/structures',
        templates: 'liferay/resources/journal/templates',
        adts: 'liferay/resources/journal/adts',
        fragments: 'liferay/resources/fragments',
        migrations: 'liferay/resources/migrations',
      },
      liferay: {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
        scopeAliases: 'scope-a,scope-b',
        timeoutSeconds: 30,
        oauth2Configured: true,
        scopeAliasesList: ['scope-a', 'scope-b'],
      },
      config: {
        cwd: '/repo',
        repoRoot: '/repo',
        dockerDir: '/repo/docker',
        liferayDir: '/repo/liferay',
        files: {
          dockerEnv: '/repo/docker/.env',
          liferayProfile: '/repo/.liferay-cli.yml',
        },
        liferay: {
          url: 'http://localhost:8080',
          oauth2ClientId: 'client-id',
          oauth2ClientSecret: 'client-secret',
          scopeAliases: 'scope-a,scope-b',
          timeoutSeconds: 30,
        },
      },
    },
    repoPaths: {
      repoRoot: '/repo',
      dockerDir: '/repo/docker',
      liferayDir: '/repo/liferay',
      dockerEnvFile: '/repo/docker/.env',
      liferayProfileFile: '/repo/.liferay-cli.yml',
    },
    capabilities: {
      os: 'linux',
      hasGit: true,
      hasBlade: false,
      hasDocker: true,
      hasDockerCompose: true,
      hasJava: true,
      hasNode: true,
      hasLcp: false,
      hasPlaywrightCli: false,
      supportsWorktrees: true,
      supportsBtrfsSnapshots: false,
    },
    tools: {
      git: {status: 'pass', available: true, version: 'git'},
      blade: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
      docker: {status: 'pass', available: true, version: 'docker'},
      dockerDaemon: {status: 'pass', available: true, version: '29.0.0'},
      dockerCompose: {status: 'pass', available: true, version: '2.0.0'},
      node: {status: 'pass', available: true, version: 'v24.0.0'},
      java: {status: 'pass', available: true, version: '21'},
      lcp: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
      playwrightCli: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
    },
    config: {
      cwd: '/repo',
      repoRoot: '/repo',
      dockerDir: '/repo/docker',
      liferayDir: '/repo/liferay',
      files: {
        dockerEnv: '/repo/docker/.env',
        liferayProfile: '/repo/.liferay-cli.yml',
      },
      liferay: {
        url: 'http://localhost:8080',
        oauth2ClientId: 'client-id',
        oauth2ClientSecret: 'client-secret',
        scopeAliases: 'scope-a,scope-b',
        timeoutSeconds: 30,
      },
    },
    configSources: {
      url: 'localProfile',
      oauth2ClientId: 'localProfile',
      oauth2ClientSecret: 'localProfile',
      scopeAliases: 'localProfile',
      timeoutSeconds: 'localProfile',
    },
    activationKeyFile: null,
    activationKeyExists: false,
    activationKeyValidName: false,
    httpPort: 8080,
    httpPortStatus: 'free',
    totalMemoryBytes: 16 * 1024 ** 3,
    worktree: false,
    ai: {
      manifestPresent: true,
      managedRules: 1,
      modifiedRules: 0,
      stalePackageRules: 0,
      staleRuntimeRules: 0,
      warnings: [],
    },
    ...overrides,
  };
}
