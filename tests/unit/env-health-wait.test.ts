import {describe, expect, test, vi} from 'vitest';

const runDockerMock = vi.fn();
const runDockerComposeMock = vi.fn();

vi.mock('../../src/core/platform/docker.js', () => ({
  runDocker: runDockerMock,
  runDockerCompose: runDockerComposeMock,
}));

const {waitForServiceHealthy} = await import('../../src/core/runtime/env-health.js');

function ok(stdout: string) {
  return {command: '', stdout, stderr: '', exitCode: 0, ok: true};
}

const context = {
  repoRoot: '/repo',
  dockerDir: '/repo/docker',
  dockerEnvFile: '/repo/docker/.env',
  composeProjectName: 'test',
  portalUrl: 'http://localhost:8080',
} as never;

describe('waitForServiceHealthy', () => {
  test('reports the service state/health instead of the raw p-wait-for message on timeout', async () => {
    runDockerComposeMock.mockResolvedValue(ok('container-123\n'));
    runDockerMock.mockImplementation((args: string[]) => {
      const format = args[2];
      return ok(format.includes('Health') ? 'starting' : 'running');
    });

    await expect(
      waitForServiceHealthy(context, 'liferay', {timeoutSeconds: 0.05, pollIntervalSeconds: 0.01}),
    ).rejects.toThrow('Timed out waiting for liferay healthy/running (state=running, health=starting).');
    await expect(
      waitForServiceHealthy(context, 'liferay', {timeoutSeconds: 0.05, pollIntervalSeconds: 0.01}),
    ).rejects.toMatchObject({code: 'ENV_SERVICE_TIMEOUT'});
  });

  test('still surfaces the failed-to-start error as-is when the container exits', async () => {
    runDockerComposeMock.mockResolvedValue(ok('container-123\n'));
    runDockerMock.mockImplementation((args: string[]) => {
      const format = args[2];
      return ok(format.includes('Health') ? '' : 'exited');
    });

    await expect(waitForServiceHealthy(context, 'liferay', {timeoutSeconds: 1})).rejects.toThrow(
      'Service liferay failed to start (state=exited, health=n/a).',
    );
    await expect(waitForServiceHealthy(context, 'liferay', {timeoutSeconds: 1})).rejects.toMatchObject({
      code: 'ENV_SERVICE_FAILED_TO_START',
    });
  });
});
