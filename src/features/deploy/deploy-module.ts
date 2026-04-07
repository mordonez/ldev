import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';

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

export type DeployModuleResult = {
  ok: true;
  module: string;
  artifactsCopiedToBuild: number;
  artifactsCopiedToCache: number;
  cacheDir: string;
  targetCommit: string;
};

export async function runDeployModule(
  config: AppConfig,
  options: {module: string; printer?: Printer},
): Promise<DeployModuleResult> {
  const module = options.module.trim();
  if (module === '') {
    throw new CliError('deploy module requires a MODULE.', {code: 'DEPLOY_MODULE_REQUIRED'});
  }

  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  await runDeployStep(options.printer, `Deploying module ${module}`, async () => {
    await runGradleTasksForModule(context, module);
  });

  const artifacts = await collectModuleArtifacts(context, module);
  ensureDeployArtifactsFound(artifacts, module);

  const artifactsCopiedToBuild = await syncArtifactsToBuildDeploy(context, artifacts);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    module,
    artifactsCopiedToBuild,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
    targetCommit,
  };
}

export function formatDeployModule(result: DeployModuleResult): string {
  return [
    `Deployed module: ${result.module}`,
    `Artifacts in build/docker/deploy: ${result.artifactsCopiedToBuild}`,
    `Artifacts in cache: ${result.artifactsCopiedToCache}`,
    `Prepared commit: ${result.targetCommit}`,
  ].join('\n');
}

async function runGradleTasksForModule(
  context: ReturnType<typeof resolveDeployContext>,
  module: string,
): Promise<void> {
  const themeDir = path.join(context.liferayDir, 'themes', module);
  if (await fs.pathExists(themeDir)) {
    await runGradleTask(context, [`:themes:${module}:dockerDeploy`, '-q']);
    return;
  }

  const apiDir = path.join(context.liferayDir, 'modules', module, `${module}-api`);
  const serviceDir = path.join(context.liferayDir, 'modules', module, `${module}-service`);
  if ((await fs.pathExists(apiDir)) && (await fs.pathExists(serviceDir))) {
    await runGradleTask(context, [
      `:modules:${module}:${module}-api:dockerDeploy`,
      '-Pliferay.workspace.environment=dockerenv',
    ]);
    await runGradleTask(context, [
      `:modules:${module}:${module}-service:dockerDeploy`,
      '-Pliferay.workspace.environment=dockerenv',
    ]);
    return;
  }

  const moduleDir = path.join(context.liferayDir, 'modules', module);
  if (await fs.pathExists(moduleDir)) {
    await runGradleTask(context, [`:modules:${module}:dockerDeploy`, '-Pliferay.workspace.environment=dockerenv']);
    return;
  }

  throw new CliError(`No module or theme named ${module} exists.`, {
    code: 'DEPLOY_MODULE_NOT_FOUND',
  });
}
