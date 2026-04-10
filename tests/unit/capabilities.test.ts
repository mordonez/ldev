import path from 'node:path';

import {describe, expect, test} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {PlatformCapabilities} from '../../src/core/platform/capabilities.js';
import {formatDoctor, runDoctor} from '../../src/features/doctor/doctor.service.js';

const BASE_CAPABILITIES: PlatformCapabilities = {
  os: 'linux',
  hasGit: true,
  hasBlade: true,
  hasDocker: true,
  hasDockerCompose: true,
  hasJava: false,
  hasNode: true,
  hasLcp: false,
  supportsWorktrees: true,
  supportsBtrfsSnapshots: true,
};

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
    url: 'http://docker-env:8080',
    oauth2ClientId: 'docker-id',
    oauth2ClientSecret: 'env-secret',
    scopeAliases: 'scope-a,scope-b',
    timeoutSeconds: 45,
  },
};

describe('capabilities', () => {
  test('returns explicit doctor sections and config sources', async () => {
    const report = await runDoctor('/repo', {
      env: {
        LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'env-secret',
      },
      config: BASE_CONFIG,
      dependencies: {
        detectCapabilities: async () => BASE_CAPABILITIES,
        detectRepoPaths: () => ({
          repoRoot: '/repo',
          dockerDir: '/repo/docker',
          liferayDir: '/repo/liferay',
          dockerEnvFile: '/repo/docker/.env',
          liferayProfileFile: '/repo/.liferay-cli.yml',
        }),
        isWorktree: async () => true,
        readEnvFile: () => ({
          BIND_IP: 'localhost',
          LIFERAY_HTTP_PORT: '8080',
          LIFERAY_CLI_URL: 'http://docker-env:8080',
          LIFERAY_CLI_OAUTH2_CLIENT_ID: 'docker-id',
          LIFERAY_CLI_HTTP_TIMEOUT_SECONDS: '45',
        }),
        readProfileFile: () => ({
          'liferay.url': 'http://profile:7070',
          'liferay.oauth2.clientId': 'profile-id',
          'liferay.oauth2.clientSecret': 'profile-secret',
          'liferay.oauth2.scopeAliases': 'scope-profile',
        }),
        runProcess: async (command) => ({
          command,
          stdout: `${command} version`,
          stderr: '',
          exitCode: 0,
          ok: true,
        }),
      },
    });

    expect(report.capabilities).toHaveProperty('os');
    expect(report.tools.git.available).toBe(true);
    expect(report.tools.blade.available).toBe(true);
    expect(report.tools.dockerDaemon.available).toBe(true);
    expect(report.environment.repoRoot).toBe('/repo');
    expect(report.environment.isWorktree).toBe(true);
    expect(report.environment.portalUrl).toBe('http://docker-env:8080');
    expect(report.config.sources.url).toBe('dockerEnv');
    expect(report.config.sources.oauth2ClientId).toBe('dockerEnv');
    expect(report.config.sources.oauth2ClientSecret).toBe('env');
    expect(report.config.liferay.scopeAliasesCount).toBe(2);
    expect(report.checks.some((check) => check.id === 'liferay-oauth2-client' && check.status === 'pass')).toBe(true);
  });

  test('marks missing repo and missing docker as failures and renders actionable text', async () => {
    const report = await runDoctor('/tmp/outside', {
      env: {},
      config: {
        ...BASE_CONFIG,
        cwd: '/tmp/outside',
        repoRoot: null,
        dockerDir: null,
        liferayDir: null,
        files: {
          dockerEnv: null,
          liferayProfile: null,
        },
        liferay: {
          ...BASE_CONFIG.liferay,
          oauth2ClientId: '',
          oauth2ClientSecret: '',
        },
      },
      dependencies: {
        detectCapabilities: async () => ({
          ...BASE_CAPABILITIES,
          hasBlade: false,
          hasDocker: false,
          hasDockerCompose: false,
        }),
        detectProject: () => ({
          type: 'unknown',
          root: null,
        }),
        detectRepoPaths: () => ({
          repoRoot: null,
          dockerDir: null,
          liferayDir: null,
          dockerEnvFile: null,
          liferayProfileFile: null,
        }),
        isWorktree: async () => false,
        readEnvFile: () => ({}),
        readProfileFile: () => ({}),
        runProcess: async (command, args) => ({
          command: [command, ...(args ?? [])].join(' '),
          stdout: '',
          stderr: '',
          exitCode: 1,
          ok: false,
        }),
      },
    });

    expect(report.ok).toBe(false);
    expect(report.summary.failed).toBeGreaterThan(0);
    expect(report.checks.some((check) => check.id === 'repo-root' && check.status === 'fail')).toBe(true);
    expect(report.checks.some((check) => check.id === 'docker' && check.status === 'fail')).toBe(true);

    const text = formatDoctor(report);
    expect(text).toContain('Doctor: FAIL');
    expect(text).toContain('Recommendations');
    expect(text).toContain('LIFERAY_CLI_OAUTH2_CLIENT_ID');
  });

  test('reports host diagnostics and activation key problems with actionable guidance', async () => {
    const report = await runDoctor('/repo', {
      env: {
        LDEV_ACTIVATION_KEY_FILE: './keys/not-an-activation-file.xml',
      },
      config: BASE_CONFIG,
      dependencies: {
        detectCapabilities: async () => BASE_CAPABILITIES,
        detectRepoPaths: () => ({
          repoRoot: '/repo',
          dockerDir: '/repo/docker',
          liferayDir: '/repo/liferay',
          dockerEnvFile: '/repo/docker/.env',
          liferayProfileFile: '/repo/.liferay-cli.yml',
        }),
        isWorktree: async () => false,
        readEnvFile: () => ({
          BIND_IP: 'localhost',
          LIFERAY_HTTP_PORT: '8080',
          LIFERAY_CLI_URL: 'http://localhost:8080',
          LIFERAY_CLI_OAUTH2_CLIENT_ID: 'docker-id',
          LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'docker-secret',
        }),
        readProfileFile: () => ({}),
        getTotalMemoryBytes: () => 4 * 1024 ** 3,
        checkTcpPort: async () => 'in-use',
        fileExists: () => false,
        runProcess: async (command, args) => ({
          command: [command, ...(args ?? [])].join(' '),
          stdout: command === 'docker' && args?.includes('info') ? '' : `${command} version`,
          stderr: command === 'docker' && args?.includes('info') ? 'daemon unavailable' : '',
          exitCode: command === 'docker' && args?.includes('info') ? 1 : 0,
          ok: !(command === 'docker' && args?.includes('info')),
        }),
      },
    });

    expect(path.normalize(report.environment.activationKeyFile ?? '')).toBe(
      path.normalize(path.resolve('/repo/keys/not-an-activation-file.xml')),
    );
    expect(report.checks.find((check) => check.id === 'host-memory')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'http-port')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'activation-key')?.status).toBe('fail');
    expect(report.checks.find((check) => check.id === 'docker-daemon')?.status).toBe('fail');

    const text = formatDoctor(report);
    expect(text).toContain('point `LDEV_ACTIVATION_KEY_FILE` to it before running `ldev start`');
    expect(text).toContain('host port localhost:8080 is already in use');
    expect(text).toContain('below the recommended 8 GB');
  });

  test('treats docker as optional for blade-workspace diagnostics', async () => {
    const report = await runDoctor('/workspace', {
      env: {},
      config: {
        ...BASE_CONFIG,
        cwd: '/workspace',
        repoRoot: '/workspace',
        dockerDir: null,
        liferayDir: null,
        files: {
          dockerEnv: null,
          liferayProfile: null,
        },
      },
      dependencies: {
        detectCapabilities: async () => ({
          ...BASE_CAPABILITIES,
          hasDocker: false,
          hasDockerCompose: false,
        }),
        detectProject: () => ({
          type: 'blade-workspace',
          root: '/workspace',
        }),
        detectProjectType: () => 'blade-workspace',
        detectRepoPaths: () => ({
          repoRoot: null,
          dockerDir: null,
          liferayDir: null,
          dockerEnvFile: null,
          liferayProfileFile: null,
        }),
        readEnvFile: () => ({}),
        readProfileFile: () => ({}),
        runProcess: async (command, args) => ({
          command: [command, ...(args ?? [])].join(' '),
          stdout: command === 'blade' ? 'blade 8.0.0' : '',
          stderr: '',
          exitCode: command === 'blade' ? 0 : 1,
          ok: command === 'blade',
        }),
        isWorktree: async () => false,
      },
    });

    expect(report.environment.projectType).toBe('blade-workspace');
    expect(report.checks.find((check) => check.id === 'docker')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'docker-compose')?.status).toBe('warn');
    expect(report.checks.find((check) => check.id === 'blade')?.status).toBe('pass');
  });
});
