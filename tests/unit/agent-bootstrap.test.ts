import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../src/features/agent/agent-bootstrap.js';
import type {AgentContextReport} from '../../src/features/agent/agent-context.js';
import type {DoctorReport} from '../../src/features/doctor/doctor-types.js';

const BASE_CONFIG: AppConfig = {
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
};

let tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => fs.rm(dir, {recursive: true, force: true})));
  tempDirs = [];
});

describe('runAiBootstrap', () => {
  test('reuses a cached bootstrap result for the same intent + cwd + project root', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-ai-bootstrap-test-'));
    tempDirs.push(cacheDir);
    const runAgentContextFn = vi.fn(() => Promise.resolve(makeContextReport()));
    const runDoctorFn = vi.fn(() => Promise.resolve(makeDoctorReport()));

    const first = await runAiBootstrap('/repo', {
      intent: 'deploy',
      config: BASE_CONFIG,
      cacheTtlSeconds: 60,
      cacheDir,
      now: () => 1000,
      runAgentContextFn,
      runDoctorFn,
    });
    const second = await runAiBootstrap('/repo', {
      intent: 'deploy',
      config: BASE_CONFIG,
      cacheTtlSeconds: 60,
      cacheDir,
      now: () => 15_000,
      runAgentContextFn,
      runDoctorFn,
    });

    expect(first.cache).toEqual({requestedTtlSeconds: 60, hit: false, ageSeconds: null});
    expect(second.cache).toEqual({requestedTtlSeconds: 60, hit: true, ageSeconds: 14});
    expect(runAgentContextFn).toHaveBeenCalledTimes(1);
    expect(runDoctorFn).toHaveBeenCalledTimes(1);
    expect(second.doctor?.readiness.deploy).toBe('ready');
  });

  test('does not reuse cached bootstrap results across intents', async () => {
    const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-ai-bootstrap-test-'));
    tempDirs.push(cacheDir);
    const runAgentContextFn = vi.fn(() => Promise.resolve(makeContextReport()));
    const runDoctorFn = vi.fn(() => Promise.resolve(makeDoctorReport()));

    await runAiBootstrap('/repo', {
      intent: 'deploy',
      config: BASE_CONFIG,
      cacheTtlSeconds: 60,
      cacheDir,
      now: () => 1000,
      runAgentContextFn,
      runDoctorFn,
    });
    await runAiBootstrap('/repo', {
      intent: 'troubleshoot',
      config: BASE_CONFIG,
      cacheTtlSeconds: 60,
      cacheDir,
      now: () => 2000,
      runAgentContextFn,
      runDoctorFn,
    });

    expect(runAgentContextFn).toHaveBeenCalledTimes(2);
    expect(runDoctorFn).toHaveBeenCalledTimes(2);
  });

  test('uses the cheaper develop profile without invoking runDoctor', async () => {
    const runAgentContextFn = vi.fn(() => Promise.resolve(makeContextReport()));
    const runDoctorFn = vi.fn(() => Promise.resolve(makeDoctorReport()));

    const result = await runAiBootstrap('/repo', {
      intent: 'develop',
      config: BASE_CONFIG,
      runAgentContextFn,
      runDoctorFn,
    });

    expect(runAgentContextFn).toHaveBeenCalledTimes(1);
    expect(runDoctorFn).not.toHaveBeenCalled();
    expect(result.doctor).not.toBeNull();
    expect(result.doctor?.checks.some((check) => check.id === 'docker-daemon' && check.status === 'skip')).toBe(true);
    expect(result.doctor?.readiness.deploy).toBe('unknown');
    expect(result.recommendedNext).toContain('--intent=deploy');
  });

  test('rejects unknown bootstrap intents instead of silently falling back', async () => {
    await expect(
      runAiBootstrap('/repo', {
        intent: 'developp',
        config: BASE_CONFIG,
      }),
    ).rejects.toThrow('Invalid bootstrap intent');
  });
});

describe('parseBootstrapCacheTtl', () => {
  test('parses a positive integer ttl', () => {
    expect(parseBootstrapCacheTtl('60')).toBe(60);
  });

  test('rejects invalid ttl values', () => {
    expect(() => parseBootstrapCacheTtl('0')).toThrow('positive integer');
    expect(() => parseBootstrapCacheTtl('abc')).toThrow('positive integer');
  });
});

function makeContextReport(overrides?: Partial<AgentContextReport>): AgentContextReport {
  return {
    ok: true,
    generatedAt: '2026-04-22T10:00:00.000Z',
    project: {
      type: 'ldev-native',
      cwd: '/repo',
      root: '/repo',
      branch: 'feat/test',
      isWorktree: false,
      worktreeRoot: null,
    },
    liferay: {
      product: 'dxp-2026.q1.0',
      version: '2026.q1.0',
      edition: 'dxp',
      image: 'liferay/dxp:2026.q1.0-lts',
      portalUrl: 'http://localhost:8080',
      auth: {
        oauth2: {
          clientId: {status: 'present', source: 'localProfile'},
          clientSecret: {status: 'present', source: 'localProfile'},
          scopes: 2,
        },
      },
      timeoutSeconds: 30,
    },
    paths: {
      dockerDir: '/repo/docker',
      liferayDir: '/repo/liferay',
      dockerEnv: '/repo/docker/.env',
      liferayProfile: '/repo/.liferay-cli.yml',
      liferayLocalProfile: '/repo/.liferay-cli.local.yml',
      resources: {
        structures: {path: 'liferay/resources/journal/structures', exists: true, count: 1},
        templates: {path: 'liferay/resources/journal/templates', exists: true, count: 1},
        adts: {path: 'liferay/resources/journal/adts', exists: false, count: 0},
        fragments: {path: 'liferay/resources/fragments', exists: false, count: 0},
        migrations: {path: 'liferay/resources/migrations', exists: false, count: 0},
      },
    },
    runtime: {
      adapter: 'ldev-native',
      composeFiles: ['docker-compose.yml'],
      services: ['liferay'],
      ports: {http: '8080', debug: null, gogo: '11311', postgres: null, elasticsearch: null},
      composeProjectName: 'labweb',
      dataRoot: '~/docker/data/default',
    },
    inventory: {
      modules: {count: 1, sample: ['sample-module']},
      themes: {count: 0, sample: []},
      clientExtensions: {count: 0, sample: []},
      wars: {count: 0, sample: []},
      deployArtifacts: {count: 0, sample: []},
    },
    ai: {
      manifestPresent: true,
      managedRules: 5,
      modifiedRules: 0,
      staleRuntimeRules: 0,
    },
    platform: {
      os: 'linux',
      tools: {
        git: true,
        docker: true,
        dockerCompose: true,
        java: true,
        node: true,
        blade: false,
        lcp: false,
        playwrightCli: false,
      },
      features: {
        worktrees: true,
        btrfsSnapshots: false,
      },
    },
    commands: {
      start: {supported: true, requires: ['runtime-adapter'], missing: []},
      deploy: {supported: true, requires: ['runtime-adapter'], missing: []},
      reindex: {
        supported: true,
        requires: ['repo', 'ldev-native-runtime', 'liferay-url', 'liferay-oauth2'],
        missing: [],
      },
      osgi: {supported: true, requires: ['repo', 'ldev-native-runtime', 'docker', 'docker-compose'], missing: []},
      liferay: {supported: true, requires: ['repo', 'liferay-url'], missing: []},
      setup: {supported: true, requires: ['ldev-native-runtime', 'repo', 'docker', 'docker-compose'], missing: []},
    },
    issues: [],
    ...overrides,
  };
}

function makeDoctorReport(overrides?: Partial<DoctorReport>): DoctorReport {
  return {
    ok: true,
    generatedAt: '2026-04-22T10:00:00.000Z',
    ranChecks: ['basic', 'runtime'],
    summary: {
      passed: 2,
      warned: 0,
      failed: 0,
      skipped: 0,
      durationMs: 25,
    },
    stamp: {
      projectType: 'ldev-native',
      portalUrl: 'http://localhost:8080',
    },
    tools: {
      git: {status: 'pass', available: true, version: 'git version'},
      blade: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
      docker: {status: 'pass', available: true, version: 'docker version'},
      dockerDaemon: {status: 'pass', available: true, version: '29.0.0'},
      dockerCompose: {status: 'pass', available: true, version: '2.0.0'},
      node: {status: 'pass', available: true, version: 'v24.0.0'},
      java: {status: 'pass', available: true, version: '21'},
      lcp: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
      playwrightCli: {status: 'warn', available: false, version: null, reason: 'not-in-path'},
    },
    checks: [],
    readiness: {
      setup: 'ready',
      start: 'ready',
      deploy: 'ready',
      reindex: 'unknown',
      osgi: 'unknown',
    },
    runtime: null,
    portal: null,
    osgi: null,
    ...overrides,
  };
}
