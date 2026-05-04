import path from 'node:path';

import {beforeEach, describe, expect, test, vi} from 'vitest';

const pathExistsMock = vi.fn();
const readFileMock = vi.fn();
const writeFileMock = vi.fn();
const ensureDirMock = vi.fn();
const readEnvFileMock = vi.fn();
const upsertEnvFileValuesMock = vi.fn();
const runDockerMock = vi.fn();
const resolveEnvContextMock = vi.fn();
const resolveDataRootMock = vi.fn();

vi.mock('fs-extra', () => ({
  default: {
    pathExists: pathExistsMock,
    readFile: readFileMock,
    writeFile: writeFileMock,
    ensureDir: ensureDirMock,
  },
}));

vi.mock('../../src/core/config/env-file.js', () => ({
  readEnvFile: readEnvFileMock,
  upsertEnvFileValues: upsertEnvFileValuesMock,
}));

vi.mock('../../src/core/platform/docker.js', () => ({
  runDocker: runDockerMock,
}));

vi.mock('../../src/core/runtime/env-context.js', () => ({
  resolveEnvContext: resolveEnvContextMock,
  resolveDataRoot: resolveDataRootMock,
}));

const {runDbFilesMount} = await import('../../src/features/db/db-files-mount.js');

describe('db files-mount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    readFileMock.mockResolvedValue('DOCLIB_VOLUME_NAME=demo-doclib\n');
    writeFileMock.mockResolvedValue(undefined);
    ensureDirMock.mockResolvedValue(undefined);
    upsertEnvFileValuesMock.mockImplementation((current: string, values: Record<string, string>) => {
      return `${current.trim()}\n${Object.entries(values)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n')}`.trim();
    });
    resolveEnvContextMock.mockReturnValue({
      dockerDir: '/repo/docker',
      envValues: {ENV_DATA_ROOT: './data/default'},
    });
    resolveDataRootMock.mockReturnValue('/repo/docker/data/default');
  });

  test('fails when an existing doclib volume cannot be removed', async () => {
    const localDoclib = path.resolve('tmp/doclib-next');
    pathExistsMock.mockResolvedValue(true);
    readEnvFileMock.mockReturnValue({
      COMPOSE_PROJECT_NAME: 'demo',
      DOCLIB_VOLUME_NAME: 'demo-doclib',
    });
    runDockerMock
      .mockResolvedValueOnce({
        command: 'docker volume inspect demo-doclib',
        stdout: '[{}]',
        stderr: '',
        exitCode: 0,
        ok: true,
      })
      .mockResolvedValueOnce({
        command: 'docker volume rm demo-doclib',
        stdout: '',
        stderr: 'volume is in use',
        exitCode: 1,
        ok: false,
      });

    await expect(
      runDbFilesMount(
        {
          cwd: '/repo',
          dockerDir: '/repo/docker',
          files: {dockerEnv: '/repo/docker/.env'},
        } as never,
        {path: localDoclib},
      ),
    ).rejects.toThrow('volume is in use');

    expect(runDockerMock).toHaveBeenCalledTimes(2);
    expect(runDockerMock).not.toHaveBeenCalledWith(expect.arrayContaining(['volume', 'create']), expect.anything());
    expect(writeFileMock).not.toHaveBeenCalled();
  });

  test('recreates the doclib bind mount when the volume is missing', async () => {
    const localDoclib = path.resolve('tmp/doclib-local');
    pathExistsMock.mockResolvedValue(true);
    readEnvFileMock.mockReturnValue({
      COMPOSE_PROJECT_NAME: 'demo',
      DOCLIB_VOLUME_NAME: 'demo-doclib',
    });
    runDockerMock
      .mockResolvedValueOnce({
        command: 'docker volume inspect demo-doclib',
        stdout: '',
        stderr: 'no such volume',
        exitCode: 1,
        ok: false,
      })
      .mockResolvedValueOnce({
        command: `docker volume create --driver local --opt type=none --opt device=${localDoclib} --opt o=bind demo-doclib`,
        stdout: 'demo-doclib',
        stderr: '',
        exitCode: 0,
        ok: true,
      });

    const result = await runDbFilesMount(
      {
        cwd: '/repo',
        dockerDir: '/repo/docker',
        files: {dockerEnv: '/repo/docker/.env'},
      } as never,
      {path: localDoclib},
    );

    expect(result).toMatchObject({
      ok: true,
      volume: 'demo-doclib',
      mode: 'local',
      path: localDoclib,
    });
    expect(runDockerMock).toHaveBeenNthCalledWith(1, ['volume', 'inspect', 'demo-doclib'], {reject: false});
    expect(runDockerMock).toHaveBeenNthCalledWith(
      2,
      [
        'volume',
        'create',
        '--driver',
        'local',
        '--opt',
        'type=none',
        '--opt',
        `device=${localDoclib}`,
        '--opt',
        'o=bind',
        'demo-doclib',
      ],
      {reject: false},
    );
    expect(writeFileMock).toHaveBeenCalledOnce();
  });
});
