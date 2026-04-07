import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runDockerCompose} from '../../core/platform/docker.js';
import {runEnvRecreate} from '../env/env-recreate.js';
import {resolveEnvContext} from '../env/env-files.js';

import {
  collectModuleArtifacts,
  ensureDeployArtifactsFound,
  ensureGradleWrapper,
  resolveDeployContext,
  resolveHeadCommit,
  runDeployStep,
  runGradleTask,
  syncArtifactsToBuildDeploy,
  syncArtifactsToDeployCache,
} from './deploy-shared.js';

export type DeployThemeResult = {
  ok: true;
  theme: string;
  artifactsCopiedToBuild: number;
  artifactsCopiedToCache: number;
  cacheDir: string;
  targetCommit: string;
  runtimeRefreshed: boolean;
};

export async function runDeployTheme(
  config: AppConfig,
  options?: {theme?: string; printer?: Printer},
): Promise<DeployThemeResult> {
  const theme = options?.theme?.trim() || 'ub-theme';
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  await runDeployStep(options?.printer, `Deploying theme ${theme}`, async () => {
    await runGradleTask(context, [`:themes:${theme}:dockerDeploy`, '-q']);
  });

  const artifacts = await collectModuleArtifacts(context, theme);
  ensureDeployArtifactsFound(artifacts, theme);

  const artifactsCopiedToBuild = await syncArtifactsToBuildDeploy(context, artifacts);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);
  const runtimeRefreshed = await refreshRunningLiferayAfterThemeDeploy(config, options?.printer);

  return {
    ok: true,
    theme,
    artifactsCopiedToBuild,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
    targetCommit,
    runtimeRefreshed,
  };
}

export function formatDeployTheme(result: DeployThemeResult): string {
  return [
    `Deployed theme: ${result.theme}`,
    `Artifacts in build/docker/deploy: ${result.artifactsCopiedToBuild}`,
    `Artifacts in cache: ${result.artifactsCopiedToCache}`,
    `Runtime refreshed: ${result.runtimeRefreshed ? 'yes' : 'no'}`,
    `Prepared commit: ${result.targetCommit}`,
  ].join('\n');
}

async function refreshRunningLiferayAfterThemeDeploy(config: AppConfig, printer?: Printer): Promise<boolean> {
  const envContext = resolveEnvContext(config);
  const psResult = await runDockerCompose(envContext.dockerDir, ['ps', '-q', 'liferay'], {
    env: process.env,
    reject: false,
  });

  if (!psResult.ok || psResult.stdout.trim() === '') {
    return false;
  }

  await runEnvRecreate(config, {
    processEnv: process.env,
    printer,
  });

  return true;
}
