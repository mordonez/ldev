import {beforeEach, describe, expect, test, vi} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {ProjectContext} from '../../src/core/config/project-context.js';

const collectEnvStatusMock = vi.fn();
const resolveEnvContextMock = vi.fn();
const runAiStatusMock = vi.fn();
const runProcessMock = vi.fn();

vi.mock('../../src/features/env/env-health.js', () => ({
  collectEnvStatus: collectEnvStatusMock,
}));

vi.mock('../../src/core/runtime/env-context.js', () => ({
  resolveEnvContext: resolveEnvContextMock,
}));

vi.mock('../../src/features/ai/ai-status.js', () => ({
  runAiStatus: runAiStatusMock,
}));

vi.mock('../../src/core/platform/process.js', () => ({
  runProcess: runProcessMock,
}));

const {formatAgentContext, runAgentContext} = await import('../../src/features/agent/agent-context.js');

const BASE_CONFIG: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: '/repo/docker',
  liferayDir: '/repo/liferay',
  files: {
    dockerEnv: '/repo/docker/.env',
    liferayProfile: '/repo/.liferay-cli.yml',
    liferayLocalProfile: '/repo/.liferay-cli.local.yml',
  },
  liferay: {
    url: 'http://localhost:8080',
    oauth2ClientId: 'client-id',
    oauth2ClientSecret: 'client-secret',
    scopeAliases: 'scope-a,scope-b',
    timeoutSeconds: 30,
  },
};

describe('agent context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveEnvContextMock.mockReturnValue({
      dataRoot: '/repo/docker/data/default',
    });
    runAiStatusMock.mockResolvedValue({
      manifestPresent: true,
      summary: {
        managedRules: 5,
        modified: 1,
        staleRuntime: 0,
      },
    });
    runProcessMock.mockResolvedValue({
      ok: false,
      stdout: '',
      stderr: '',
      exitCode: 1,
      command: 'docker',
    });
  });

  test('collects machine-readable runtime issues for degraded local environments', async () => {
    collectEnvStatusMock.mockResolvedValue({
      portalReachable: false,
      liferay: {
        state: 'exited',
        health: 'unhealthy',
      },
      services: [],
    });
    runProcessMock
      .mockResolvedValueOnce({
        ok: true,
        stdout: '42|Resolved|1|com.example.bad (1.0.0)\n',
        stderr: '',
        exitCode: 0,
        command: 'docker compose exec',
      })
      .mockResolvedValueOnce({
        ok: true,
        stdout: 'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/root 100 95 5 95% /repo\n',
        stderr: '',
        exitCode: 0,
        command: 'df -P',
      });

    const report = await runAgentContext('/repo', {
      config: BASE_CONFIG,
      project: makeProjectContext(),
      detectCapabilitiesFn: () => Promise.resolve(makePlatformCapabilities()),
      getCurrentBranchNameFn: () => Promise.resolve('feat/test'),
      isWorktreeFn: () => Promise.resolve(false),
    });

    expect(report.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({code: 'portal-unreachable', severity: 'warning'}),
        expect.objectContaining({code: 'liferay-not-running', severity: 'error'}),
        expect.objectContaining({code: 'osgi-resolved-bundles', severity: 'warning'}),
        expect.objectContaining({code: 'disk-high', severity: 'warning'}),
      ]),
    );
    expect(report.commands.worktree.supported).toBe(true);
    expect(formatAgentContext(report)).toContain('Issues:   4');
  });

  test('returns the workspace runtime pending issue for blade workspaces', async () => {
    collectEnvStatusMock.mockResolvedValue(null);

    const report = await runAgentContext('/repo', {
      config: BASE_CONFIG,
      project: makeProjectContext({projectType: 'blade-workspace'}),
      detectCapabilitiesFn: () => Promise.resolve({...makePlatformCapabilities(), hasBlade: true}),
      getCurrentBranchNameFn: () => Promise.resolve('feat/workspace'),
      isWorktreeFn: () => Promise.resolve(true),
    });

    expect(report.project.isWorktree).toBe(true);
    expect(report.issues).toEqual([expect.objectContaining({code: 'workspace-runtime-pending', severity: 'info'})]);
    expect(runProcessMock).not.toHaveBeenCalled();
  });
});

function makePlatformCapabilities() {
  return {
    os: 'linux' as const,
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
  };
}

function makeProjectContext(overrides?: Partial<ProjectContext>): ProjectContext {
  return {
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
      composeProjectName: 'demo',
      dataRoot: '/repo/docker/data/default',
    },
    inventory: {
      liferay: {
        product: 'dxp-2026.q1.0',
        image: 'liferay/dxp:2026.q1.0-lts',
        version: 'liferay/dxp:2026.q1.0-lts',
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
      dockerEnv: {
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'client-id',
      },
      profile: {},
      localProfile: {
        'liferay.oauth2.clientSecret': 'client-secret',
      },
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
    config: BASE_CONFIG,
    ...overrides,
  } as ProjectContext;
}
