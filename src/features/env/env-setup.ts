import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {listDeployArtifacts, resolveDeployCacheDir} from '../deploy/deploy-shared.js';
import {runDeployAll} from '../deploy/deploy-all.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {ensureEnvDataLayout, ensureEnvFile, resolveEnvContext} from './env-files.js';

export type EnvSetupResult = {
  ok: true;
  dockerEnvFile: string;
  dataRoot: string;
  createdDirectories: string[];
  pulledImages: boolean;
  warmedDeployCache: boolean;
};

export async function runEnvSetup(
  config: AppConfig,
  options?: {skipPull?: boolean; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvSetupResult> {
  if (config.repoRoot && resolveWorktreeContext(config.repoRoot).isWorktree) {
    await runWorktreeEnv({cwd: config.cwd, printer: options?.printer});
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd);

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker y docker compose son obligatorios para env setup.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  await ensureEnvFile(context);
  const createdDirectories = await ensureEnvDataLayout(context);
  const warmedDeployCache = await warmDeployCacheIfNeeded(config, options?.printer);

  if (!(options?.skipPull ?? false)) {
    if (options?.printer) {
      await withProgress(options.printer, 'Descargando imagenes base de Docker', async () => {
        await runDockerComposeOrThrow(context.dockerDir, ['pull', '--ignore-buildable'], {
          env: options?.processEnv,
        });
      });
    } else {
      await runDockerComposeOrThrow(context.dockerDir, ['pull', '--ignore-buildable'], {
        env: options?.processEnv,
      });
    }
  }

  return {
    ok: true,
    dockerEnvFile: context.dockerEnvFile,
    dataRoot: context.dataRoot,
    createdDirectories,
    pulledImages: !(options?.skipPull ?? false),
    warmedDeployCache,
  };
}

export function formatEnvSetup(result: EnvSetupResult): string {
  return [
    `Entorno preparado en ${result.dockerEnvFile}`,
    `Data root: ${result.dataRoot}`,
    `Deploy cache caliente: ${result.warmedDeployCache ? 'sí' : 'no'}`,
    `Docker pull: ${result.pulledImages ? 'ejecutado' : 'omitido'}`,
  ].join('\n');
}

async function warmDeployCacheIfNeeded(config: AppConfig, printer?: Printer): Promise<boolean> {
  if (!config.repoRoot || !config.liferayDir || !config.dockerDir) {
    return false;
  }

  const cacheDir = await resolveDeployCacheDir(config);
  const cachedArtifacts = await listDeployArtifacts(cacheDir);
  if (cachedArtifacts.length > 0) {
    return false;
  }

  try {
    if (printer) {
      await withProgress(printer, 'Preparando artefactos iniciales para el deploy cache', async () => {
        await runDeployAll(config, {printer: undefined});
      });
    } else {
      await runDeployAll(config);
    }

    return true;
  } catch (error) {
    if (error instanceof CliError && error.code === 'DEPLOY_GRADLEW_NOT_FOUND') {
      return false;
    }

    throw error;
  }
}
