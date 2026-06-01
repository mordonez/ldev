import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {DeployErrors} from './errors/deploy-error-factory.js';
import {resolveDeployModuleTarget} from './deploy-module-resolver.js';

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

export type DeployModuleResult = {
  ok: true;
  module: string;
  artifactsCopiedToBuild: number;
  artifactsCopiedToCache: number;
  artifactsHotDeployed: number;
  hotDeployed: boolean;
  hotDeployReason: string | null;
  hotDeployTarget: string | null;
  cacheDir: string;
  targetCommit: string;
};

export async function runDeployModule(
  config: AppConfig,
  options: {module: string; printer?: Printer},
): Promise<DeployModuleResult> {
  const module = options.module.trim();
  if (module === '') {
    throw DeployErrors.moduleRequired('deploy module requires a MODULE.');
  }

  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);
  const target = await resolveDeployModuleTarget(context, module);

  await runDeployStep(options.printer, `Deploying module ${target.label}`, async () => {
    for (const task of target.gradleTasks) {
      await runGradleTask(context, task);
    }
  });

  const artifacts = await collectModuleArtifacts(context, module);
  ensureDeployArtifactsFound(artifacts, module);

  const artifactsCopiedToBuild = await syncArtifactsToBuildDeploy(context, artifacts);
  const hotDeploy = await hotDeployArtifactsToRunningLiferay(config, artifacts);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    module: target.label,
    artifactsCopiedToBuild,
    artifactsCopiedToCache: cache.copied,
    artifactsHotDeployed: hotDeploy.copied,
    hotDeployed: hotDeploy.hotDeployed,
    hotDeployReason: hotDeploy.reason,
    hotDeployTarget: hotDeploy.target,
    cacheDir: cache.cacheDir,
    targetCommit,
  };
}

export function formatDeployModule(result: DeployModuleResult): string {
  return [
    `Deployed module: ${result.module}`,
    `Artifacts in build/docker/deploy: ${result.artifactsCopiedToBuild}`,
    `Hot deployed to running Liferay: ${result.hotDeployed ? `yes (${result.artifactsHotDeployed})` : 'no'}`,
    ...(result.hotDeployReason ? [`Hot deploy reason: ${result.hotDeployReason}`] : []),
    ...(result.hotDeployTarget ? [`Hot deploy target: ${result.hotDeployTarget}`] : []),
    `Artifacts in cache: ${result.artifactsCopiedToCache}`,
    `Prepared commit: ${result.targetCommit}`,
  ].join('\n');
}
