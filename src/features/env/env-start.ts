import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/print.js';
import {withProgress} from '../../core/output/print.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {restoreArtifactsFromDeployCache, resolveDeployContext} from '../deploy/deploy-shared.js';
import {runDeployModule} from '../deploy/deploy-module.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {ensureActivationKeyPrepared} from './env-activation-key.js';
import {waitForServiceHealthy} from './env-health.js';
import {ensureDoclibVolume, resolveEnvContext, seedBuildDockerConfigs} from './env-files.js';

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
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker y docker compose son obligatorios para env start.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  const activationKey = await ensureActivationKeyPrepared(config, options?.activationKeyFile);
  await seedBuildDockerConfigs(context);
  await restoreBuildDeployFromCache(config);
  await ensureBootstrapModulePrepared(config, options?.printer);
  await ensureDoclibVolume(context, {processEnv: options?.processEnv});

  if (options?.printer) {
    await withProgress(options.printer, 'Arrancando servicios Docker', async () => {
      await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
        env: options?.processEnv,
      });
    });
  } else {
    await runDockerComposeOrThrow(context.dockerDir, ['up', '-d'], {
      env: options?.processEnv,
    });
  }

  if (options?.wait ?? true) {
    try {
      if (options?.printer) {
        await withProgress(options.printer, 'Esperando a que liferay este listo', async () => {
          await waitForServiceHealthy(context, 'liferay', {
            timeoutSeconds: options?.timeoutSeconds ?? 250,
            processEnv: options?.processEnv,
          });
        });
      } else {
        await waitForServiceHealthy(context, 'liferay', {
          timeoutSeconds: options?.timeoutSeconds ?? 250,
          processEnv: options?.processEnv,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error esperando la salud del servicio liferay.';
      throw new CliError(message, {code: 'ENV_START_TIMEOUT'});
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
    `Entorno arrancado desde ${result.dockerDir}`,
    `Portal URL: ${result.portalUrl}`,
    `Activation key: ${result.activationKeyFile ?? 'sin cambios'}`,
    `Espera de salud: ${result.waitedForHealth ? 'sí' : 'no'}`,
  ].join('\n');
}

async function ensureBootstrapModulePrepared(config: AppConfig, printer?: Printer): Promise<void> {
  if (!config.liferayDir) {
    return;
  }

  const moduleName = 'liferay-cli-bootstrap';
  const moduleDir = path.join(config.liferayDir, 'modules', moduleName);
  if (!(await fs.pathExists(moduleDir))) {
    return;
  }

  const buildDeployDir = path.join(config.liferayDir, 'build', 'docker', 'deploy');
  const hasPreparedArtifact = await hasBootstrapArtifact(buildDeployDir);
  if (hasPreparedArtifact) {
    return;
  }

  if (printer) {
    await withProgress(printer, `Preparando módulo ${moduleName}`, async () => {
      await runDeployModule(config, {module: moduleName});
    });
    return;
  }

  await runDeployModule(config, {module: moduleName});
}

async function hasBootstrapArtifact(buildDeployDir: string): Promise<boolean> {
  if (!(await fs.pathExists(buildDeployDir))) {
    return false;
  }

  const entries = await fs.readdir(buildDeployDir, {withFileTypes: true});
  return entries.some((entry) => entry.isFile() && entry.name.includes('liferay.cli.bootstrap') && entry.name.endsWith('.jar'));
}

async function restoreBuildDeployFromCache(config: AppConfig): Promise<void> {
  if (!config.liferayDir || !config.repoRoot || !config.dockerDir) {
    return;
  }

  const context = resolveDeployContext(config);
  const buildArtifacts = await fs.pathExists(context.buildDeployDir)
    ? await fs.readdir(context.buildDeployDir, {withFileTypes: true})
    : [];

  if (buildArtifacts.some((entry) => entry.isFile() && /\.(jar|war|xml)$/i.test(entry.name))) {
    return;
  }

  await restoreArtifactsFromDeployCache(config, context);
}
