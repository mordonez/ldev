import pWaitFor from 'p-wait-for';

import {CliError} from '../errors.js';
import {runDocker, runDockerCompose} from '../platform/docker.js';
import type {RunProcessOptions} from '../platform/process.js';
import {parseLines} from '../utils/text.js';
import type {EnvContext} from './env-context.js';

export type EnvServiceStatus = {
  service: string;
  state: string | null;
  health: string | null;
  containerId: string | null;
};

export type EnvStatusReport = {
  ok: boolean;
  repoRoot: string;
  dockerDir: string;
  dockerEnvFile: string;
  composeProjectName: string;
  portalUrl: string;
  portalReachable: boolean;
  services: EnvServiceStatus[];
  liferay: EnvServiceStatus | null;
};

export async function collectEnvStatus(
  context: EnvContext,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<EnvStatusReport> {
  const processOptions: RunProcessOptions | undefined = options?.processEnv ? {env: options.processEnv} : undefined;
  const services = await listComposeServices(context, processOptions);
  const detailedServices = await Promise.all(
    services.map((service) => inspectComposeService(context, service, processOptions)),
  );
  const portalReachable = await isPortalReachable(context.portalUrl);
  const liferay = detailedServices.find((service) => service.service === 'liferay') ?? null;

  return {
    ok: true,
    repoRoot: context.repoRoot,
    dockerDir: context.dockerDir,
    dockerEnvFile: context.dockerEnvFile,
    composeProjectName: context.composeProjectName,
    portalUrl: context.portalUrl,
    portalReachable,
    services: detailedServices,
    liferay,
  };
}

export async function waitForServiceHealthy(
  context: EnvContext,
  service: string,
  options?: {timeoutSeconds?: number; pollIntervalSeconds?: number; processEnv?: NodeJS.ProcessEnv},
): Promise<EnvServiceStatus> {
  const timeoutSeconds = options?.timeoutSeconds ?? 250;
  const pollIntervalSeconds = options?.pollIntervalSeconds ?? 5;
  const processOptions = options?.processEnv ? {env: options.processEnv} : undefined;

  try {
    await pWaitFor(
      async () => {
        const current = await inspectComposeService(context, service, processOptions);

        if (current.state === 'exited' || current.state === 'dead') {
          throw new CliError(
            `Service ${service} failed to start (state=${current.state}, health=${current.health ?? 'n/a'}).`,
            {code: 'ENV_SERVICE_FAILED_TO_START'},
          );
        }

        return isHealthyEnough(current);
      },
      {timeout: timeoutSeconds * 1000, interval: pollIntervalSeconds * 1000},
    );
  } catch (error) {
    if (error instanceof Error && (error.message.includes('failed to start') || !error.message.includes('Timed out'))) {
      throw error;
    }

    const last = await inspectComposeService(context, service, processOptions);
    throw new CliError(
      `Timed out waiting for ${service} healthy/running (state=${last.state}, health=${last.health ?? 'n/a'}).`,
      {code: 'ENV_SERVICE_TIMEOUT'},
    );
  }

  return inspectComposeService(context, service, processOptions);
}

export async function waitForPortalReady(
  portalUrl: string,
  options?: {timeoutMs?: number; pollIntervalMs?: number},
): Promise<void> {
  const timeoutMs = options?.timeoutMs ?? 180_000;
  const pollIntervalMs = options?.pollIntervalMs ?? 5_000;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (await isPortalInitialized(portalUrl)) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

function isHealthyEnough(service: EnvServiceStatus): boolean {
  if (service.health === 'healthy') {
    return true;
  }

  return service.state === 'running' && service.health === null;
}

async function listComposeServices(context: EnvContext, processOptions?: RunProcessOptions): Promise<string[]> {
  const result = await runDockerCompose(context.dockerDir, ['config', '--services'], processOptions);
  if (!result.ok) {
    return ['liferay'];
  }

  return parseLines(result.stdout);
}

async function inspectComposeService(
  context: EnvContext,
  service: string,
  processOptions?: RunProcessOptions,
): Promise<EnvServiceStatus> {
  const containerIdResult = await runDockerCompose(context.dockerDir, ['ps', '-q', service], processOptions);
  const containerId = containerIdResult.ok ? firstLine(containerIdResult.stdout) : null;

  if (!containerId) {
    return {
      service,
      state: null,
      health: null,
      containerId: null,
    };
  }

  const state = await inspectContainerField(containerId, '{{.State.Status}}', processOptions);
  const health = await inspectContainerField(
    containerId,
    '{{if .State.Health}}{{.State.Health.Status}}{{end}}',
    processOptions,
  );

  return {
    service,
    state,
    health,
    containerId,
  };
}

async function inspectContainerField(
  containerId: string,
  format: string,
  processOptions?: RunProcessOptions,
): Promise<string | null> {
  const result = await runDocker(['inspect', '-f', format, containerId], processOptions);
  if (!result.ok) {
    return null;
  }

  const value = firstLine(result.stdout);
  return value === '' ? null : value;
}

async function isPortalInitialized(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/c/portal/login`, {
      signal: AbortSignal.timeout(3000),
      redirect: 'manual',
    });

    return response.status === 302 || response.status === 200;
  } catch {
    return false;
  }
}

async function isPortalReachable(url: string): Promise<boolean> {
  try {
    const response = await fetch(`${url}/c/portal/login`, {
      signal: AbortSignal.timeout(1000),
      redirect: 'manual',
    });
    return response.status >= 200 && response.status < 500;
  } catch {
    return false;
  }
}

function firstLine(value: string): string | null {
  const line = value
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item !== '');

  return line ?? null;
}
