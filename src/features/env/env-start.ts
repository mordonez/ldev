import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import type {EnvStartResult} from '../../core/runtime/env-types.js';
import {restoreArtifactsFromDeployCache, resolveDeployContext} from '../deploy/deploy-shared.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {ensureActivationKeyPrepared} from './env-activation-key.js';
import {EnvErrors} from './errors/env-error-factory.js';
import {waitForServiceHealthy, waitForPortalReady} from './env-health.js';
import {buildComposeEnv, ensureDoclibVolume, resolveEnvContext, seedBuildDockerConfigs} from './env-files.js';
import {runEnvStop} from './env-stop.js';

export type {EnvStartResult} from '../../core/runtime/env-types.js';

export async function runEnvStart(
  config: AppConfig,
  options?: {
    wait?: boolean;
    timeoutSeconds?: number;
    processEnv?: NodeJS.ProcessEnv;
    printer?: Printer;
    activationKeyFile?: string;
    signal?: AbortSignal;
  },
): Promise<EnvStartResult> {
  const waitForHealth = options?.wait ?? true;
  const startupTimeoutSeconds = options?.timeoutSeconds ?? 250;

  if (config.repoRoot && resolveWorktreeContext(config.repoRoot).isWorktree) {
    await runWorktreeEnv({cwd: config.cwd, printer: options?.printer});
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd, {processEnv: options?.processEnv});

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw EnvErrors.capabilityMissing('Docker and docker compose are required for env start.');
  }

  const activationKey = await ensureActivationKeyPrepared(config, options?.activationKeyFile);
  await seedBuildDockerConfigs(context);
  await restoreBuildDeployFromCache(config);
  await ensureDoclibVolume(context, {processEnv: options?.processEnv});
  const composeEnv = buildComposeEnv(context, {baseEnv: options?.processEnv});
  const signal = options?.signal;
  const rollbackStartedEnvironment = async () => {
    await runEnvStop(config, {
      processEnv: options?.processEnv,
    });
  };

  try {
    if (options?.printer) {
      await withProgress(options.printer, 'Starting Docker services', async () => {
        await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
          env: composeEnv,
          signal,
        });
      });
    } else {
      await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
        env: composeEnv,
        signal,
      });
    }
  } catch (error) {
    if (signal?.aborted) {
      await rollbackStartedEnvironment();
    }

    throw error;
  }

  if (signal?.aborted) {
    await rollbackStartedEnvironment();
    throw new Error('Environment start was canceled.');
  }

  if (waitForHealth) {
    try {
      if (options?.printer) {
        await withProgress(options.printer, 'Waiting for Liferay to become ready', async () => {
          await waitForServiceHealthy(context, 'liferay', {
            timeoutSeconds: startupTimeoutSeconds,
            processEnv: composeEnv,
          });
        });
        await withProgress(options.printer, 'Waiting for portal to finish deploying bundles', async () => {
          await waitForPortalReady(context.portalUrl, {
            timeoutMs: startupTimeoutSeconds * 1000,
            localHttpsCaCertFile: context.localHttpsCaCertFile,
          });
        });
      } else {
        await waitForServiceHealthy(context, 'liferay', {
          timeoutSeconds: startupTimeoutSeconds,
          processEnv: composeEnv,
        });
        await waitForPortalReady(context.portalUrl, {
          timeoutMs: startupTimeoutSeconds * 1000,
          localHttpsCaCertFile: context.localHttpsCaCertFile,
        });
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Timed out while waiting for the Liferay service health.';
      throw EnvErrors.startTimeout(message);
    }
  }

  return {
    ok: true,
    dockerDir: context.dockerDir,
    portalUrl: context.portalUrl,
    waitedForHealth: waitForHealth,
    activationKeyFile: activationKey.destinationFile,
    localHttpsCaCertInstallCommand: resolveLocalHttpsCaCertInstallCommand(context.dockerDir, composeEnv.COMPOSE_FILE),
  };
}

export function formatEnvStart(result: EnvStartResult): string {
  const lines = [
    `Environment started from ${result.dockerDir}`,
    `Portal URL: ${result.portalUrl}`,
    `Activation key: ${result.activationKeyFile ?? 'unchanged'}`,
    `Health wait: ${result.waitedForHealth ? 'yes' : 'no'}`,
  ];

  if (result.localHttpsCaCertInstallCommand) {
    lines.push(
      'HTTPS certificate: run this once to trust the local CA and avoid browser warnings:',
      `  ${result.localHttpsCaCertInstallCommand}`,
    );
  }

  return lines.join('\n');
}

function resolveLocalHttpsCaCertInstallCommand(dockerDir: string, composeFile: string | undefined): string | null {
  if (!composeFileUsesWebserver(composeFile)) {
    return null;
  }

  if (process.platform === 'win32') {
    return `powershell -ExecutionPolicy Bypass -File "${path.join(dockerDir, 'scripts', 'trust-local-https-ca.ps1')}"`;
  }

  return `sh "${path.join(dockerDir, 'scripts', 'trust-local-https-ca.sh')}"`;
}

function composeFileUsesWebserver(composeFile: string | undefined): boolean {
  return (composeFile ?? '')
    .split(path.delimiter)
    .map((file) => path.basename(file.trim()))
    .includes('docker-compose.webserver.yml');
}
async function restoreBuildDeployFromCache(config: AppConfig): Promise<void> {
  if (!config.liferayDir || !config.repoRoot || !config.dockerDir) {
    return;
  }

  const context = resolveDeployContext(config);
  const buildArtifacts = (await fs.pathExists(context.buildDeployDir))
    ? await fs.readdir(context.buildDeployDir, {withFileTypes: true})
    : [];

  if (buildArtifacts.some((entry) => entry.isFile() && /\.(jar|war|xml)$/i.test(entry.name))) {
    return;
  }

  await restoreArtifactsFromDeployCache(config, context);
}
