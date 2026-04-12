import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

import {
  collectModuleArtifacts,
  ensureDeployArtifactsFound,
  ensureGradleWrapper,
  hotDeployArtifactsToRunningLiferay,
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
  artifactsHotDeployed: number;
  hotDeployed: boolean;
  hotDeployReason: string | null;
  hotDeployTarget: string | null;
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
  const hotDeploy = await hotDeployArtifactsToRunningLiferay(config, artifacts);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    theme,
    artifactsCopiedToBuild,
    artifactsCopiedToCache: cache.copied,
    artifactsHotDeployed: hotDeploy.copied,
    hotDeployed: hotDeploy.hotDeployed,
    hotDeployReason: hotDeploy.reason,
    hotDeployTarget: hotDeploy.target,
    cacheDir: cache.cacheDir,
    targetCommit,
    runtimeRefreshed: hotDeploy.hotDeployed,
  };
}

export function formatDeployTheme(result: DeployThemeResult): string {
  return [
    `Deployed theme: ${result.theme}`,
    `Artifacts in build/docker/deploy: ${result.artifactsCopiedToBuild}`,
    `Hot deployed to running Liferay: ${result.hotDeployed ? `yes (${result.artifactsHotDeployed})` : 'no'}`,
    ...(result.hotDeployReason ? [`Hot deploy reason: ${result.hotDeployReason}`] : []),
    ...(result.hotDeployTarget ? [`Hot deploy target: ${result.hotDeployTarget}`] : []),
    `Artifacts in cache: ${result.artifactsCopiedToCache}`,
    `Runtime refreshed: ${result.runtimeRefreshed ? 'yes' : 'no'}`,
    `Prepared commit: ${result.targetCommit}`,
  ].join('\n');
}
