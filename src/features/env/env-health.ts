import type {RunProcessOptions} from '../../core/platform/process.js';
import {runDocker, runDockerCompose} from '../../core/platform/docker.js';
import type {EnvContext} from './env-files.js';

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
  const detailedServices = await Promise.all(services.map((service) => inspectComposeService(context, service, processOptions)));
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
  const deadline = Date.now() + timeoutSeconds * 1000;

  while (Date.now() < deadline) {
    const current = await inspectComposeService(context, service, options?.processEnv ? {env: options.processEnv} : undefined);
    if (isHealthyEnough(current)) {
      return current;
    }

    if (current.state === 'exited' || current.state === 'dead') {
      throw new Error(
        `Servicio ${service} no pudo arrancar (state=${current.state}, health=${current.health ?? 'n/a'}).`,
      );
    }

    await sleep(pollIntervalSeconds * 1000);
  }

  const last = await inspectComposeService(context, service, options?.processEnv ? {env: options.processEnv} : undefined);
  throw new Error(
    `Timeout esperando ${service} healthy/running (state=${last.state ?? 'unknown'}, health=${last.health ?? 'n/a'}).`,
  );
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

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
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
  const health = await inspectContainerField(containerId, '{{if .State.Health}}{{.State.Health.Status}}{{end}}', processOptions);

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

function sleep(timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
}
