import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {upsertEnvFileValues} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {detectCapabilities} from '../../core/platform/capabilities.js';
import {listDeployArtifacts, resolveDeployCacheDir} from '../deploy/deploy-shared.js';
import {runDeployAll} from '../deploy/deploy-all.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import {runWorktreeEnv} from '../worktree/worktree-env.js';

import {buildComposeFilesEnv, ensureEnvDataLayout, ensureEnvFile, resolveEnvContext} from './env-files.js';

export type EnvSetupResult = {
  ok: true;
  dockerEnvFile: string;
  dataRoot: string;
  createdDirectories: string[];
  pulledImages: boolean;
  warmedDeployCache: boolean;
  composeFileWritten: string | null;
};

export async function runEnvSetup(
  config: AppConfig,
  options?: {with?: string[]; skipPull?: boolean; processEnv?: NodeJS.ProcessEnv; printer?: Printer},
): Promise<EnvSetupResult> {
  if (config.repoRoot && resolveWorktreeContext(config.repoRoot).isWorktree) {
    await runWorktreeEnv({cwd: config.cwd, printer: options?.printer});
  }

  const context = resolveEnvContext(config);
  const capabilities = await detectCapabilities(config.cwd, {processEnv: options?.processEnv});

  if (!capabilities.hasDocker || !capabilities.hasDockerCompose) {
    throw new CliError('Docker and docker compose are required for env setup.', {code: 'ENV_CAPABILITY_MISSING'});
  }

  await ensureEnvFile(context);
  const createdDirectories = await ensureEnvDataLayout(context);
  const warmedDeployCache = await warmDeployCacheIfNeeded(config, options?.printer);
  const composeFileWritten = await persistComposeProfile(context.dockerDir, config.liferayDir, options?.with ?? []);

  const composeEnv = buildComposeFilesEnv(options?.with ?? [], options?.processEnv);

  if (!(options?.skipPull ?? false)) {
    if (options?.printer) {
      await withProgress(options.printer, 'Pulling base Docker images', async () => {
        await runDockerComposeOrThrow(context.dockerDir, ['pull', '--ignore-buildable'], {env: composeEnv});
      });
    } else {
      await runDockerComposeOrThrow(context.dockerDir, ['pull', '--ignore-buildable'], {env: composeEnv});
    }
  }

  return {
    ok: true,
    dockerEnvFile: context.dockerEnvFile,
    dataRoot: context.dataRoot,
    createdDirectories,
    pulledImages: !(options?.skipPull ?? false),
    warmedDeployCache,
    composeFileWritten,
  };
}

export function formatEnvSetup(result: EnvSetupResult): string {
  return [
    `Environment prepared at ${result.dockerEnvFile}`,
    `Data root: ${result.dataRoot}`,
    `Deploy cache warmed: ${result.warmedDeployCache ? 'yes' : 'no'}`,
    `Docker pull: ${result.pulledImages ? 'executed' : 'skipped'}`,
    result.composeFileWritten ? `Profile saved: ${result.composeFileWritten}` : 'Profile: DXP only (embedded)',
  ].join('\n');
}

/**
 * Persists the compose profile choice to docker/.env and copies the required
 * OSGi configs into liferay/configs/dockerenv/osgi/configs/ so that
 * `ldev start` works without --with arguments on subsequent runs.
 *
 * Returns the COMPOSE_FILE value written, or null when no services were selected.
 */
async function persistComposeProfile(
  dockerDir: string,
  liferayDir: string | null | undefined,
  withServices: string[],
): Promise<string | null> {
  if (withServices.length === 0) return null;

  const composeFiles = ['docker-compose.yml', ...withServices.map((s) => `docker-compose.${s}.yml`)];
  const composeFileValue = composeFiles.join(':');

  const envFile = path.join(dockerDir, '.env');
  const current = (await fs.pathExists(envFile)) ? await fs.readFile(envFile, 'utf8') : '';
  await fs.writeFile(envFile, upsertEnvFileValues(current, {COMPOSE_FILE: composeFileValue}) + '\n');

  if (liferayDir && withServices.includes('elasticsearch')) {
    const src = path.join(dockerDir, 'liferay-configs-full', 'osgi', 'configs');
    const dst = path.join(liferayDir, 'configs', 'dockerenv', 'osgi', 'configs');
    if (await fs.pathExists(src)) {
      await fs.ensureDir(dst);
      await fs.copy(src, dst, {overwrite: true});
    }
  }

  return composeFileValue;
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
      await withProgress(printer, 'Preparing initial artifacts for the deploy cache', async () => {
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

    if (isMissingHeadGitError(error)) {
      return false;
    }

    // A fresh scaffold may not contain deployable artifacts yet, and build
    // failures during cache warm are also non-fatal. Setup can proceed and
    // the next deploy/start path will retry if the cache is still empty.
    if (
      error instanceof CliError &&
      (error.code === 'DEPLOY_GRADLE_ERROR' || error.code === 'DEPLOY_ARTIFACTS_NOT_FOUND')
    ) {
      return false;
    }

    throw error;
  }
}

function isMissingHeadGitError(error: unknown): boolean {
  return (
    error instanceof CliError &&
    error.code === 'GIT_ERROR' &&
    /ambiguous argument 'HEAD'|unknown revision or path not in the working tree/i.test(error.message)
  );
}
