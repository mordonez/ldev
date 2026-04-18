import fs from 'fs-extra';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {restoreArtifactsFromDeployCache, resolveDeployContext} from '../deploy/deploy-shared.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {ensureActivationKeyPrepared} from './env-activation-key.js';
import {EnvErrors} from './errors/index.js';
import {waitForServiceHealthy, waitForPortalReady} from './env-health.js';
import {buildComposeEnv, ensureDoclibVolume, resolveEnvContext, seedBuildDockerConfigs} from './env-files.js';

export type EnvStartResult = {
  ok: true;
  dockerDir: string;
  portalUrl: string;
  waitedForHealth: boolean;
  activationKeyFile: string | null;
};

export async function runEnvStart(
  config: AppConfig,
  options?: {
    wait?: boolean;
    timeoutSeconds?: number;
    processEnv?: NodeJS.ProcessEnv;
    printer?: Printer;
    activationKeyFile?: string;
  },
): Promise<EnvStartResult> {
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

  if (options?.printer) {
    await withProgress(options.printer, 'Starting Docker services', async () => {
      await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
        env: composeEnv,
      });
    });
  } else {
    await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
      env: composeEnv,
    });
  }

  if (options?.wait ?? true) {
    try {
      if (options?.printer) {
        await withProgress(options.printer, 'Waiting for Liferay to become ready', async () => {
          await waitForServiceHealthy(context, 'liferay', {
            timeoutSeconds: options?.timeoutSeconds ?? 250,
            processEnv: composeEnv,
          });
        });
        await withProgress(options.printer, 'Waiting for portal to finish deploying bundles', async () => {
          await waitForPortalReady(context.portalUrl, {
            timeoutMs: (options?.timeoutSeconds ?? 250) * 1000,
          });
        });
      } else {
        await waitForServiceHealthy(context, 'liferay', {
          timeoutSeconds: options?.timeoutSeconds ?? 250,
          processEnv: composeEnv,
        });
        await waitForPortalReady(context.portalUrl, {
          timeoutMs: (options?.timeoutSeconds ?? 250) * 1000,
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
    waitedForHealth: options?.wait ?? true,
    activationKeyFile: activationKey.destinationFile,
  };
}

export function formatEnvStart(result: EnvStartResult): string {
  return [
    `Environment started from ${result.dockerDir}`,
    `Portal URL: ${result.portalUrl}`,
    `Activation key: ${result.activationKeyFile ?? 'unchanged'}`,
    `Health wait: ${result.waitedForHealth ? 'yes' : 'no'}`,
  ].join('\n');
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
