import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {collectEnvStatus} from '../../core/runtime/env-health.js';
import {resolveEnvContext} from '../../core/runtime/env-context.js';
import {
  ensureGradleWrapper,
  resolveDeployContext,
  resolveHeadCommit,
  restoreTrackedServiceProperties,
  runDeployStep,
  runGradleTask,
  seedBuildDockerConfigs,
  shouldRunBuildService,
  syncArtifactsToDeployCache,
  listDeployArtifacts,
  writePrepareCommit,
} from './deploy-shared.js';

export type DeployPrepareResult = {
  ok: true;
  repoRoot: string;
  liferayDir: string;
  buildDir: string;
  targetCommit: string;
  buildServiceExecuted: boolean;
  dockerDeployExecuted: boolean;
  seededDockerenv: boolean;
  artifactsCopiedToCache: number;
  cacheDir: string;
};

export async function runDeployPrepare(
  config: AppConfig,
  options?: {printer?: Printer; allowRunningEnv?: boolean; processEnv?: NodeJS.ProcessEnv},
): Promise<DeployPrepareResult> {
  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);
  await ensurePrepareEnvStopped(config, {
    allowRunningEnv: Boolean(options?.allowRunningEnv),
    processEnv: options?.processEnv,
  });

  const modulesDir = `${context.liferayDir}/modules`;
  const buildServiceExecuted = (await shouldRunBuildService(modulesDir))
    ? await runDeployStep(options?.printer, 'Running buildService', async () => {
        await runGradleTask(context, ['buildService', '-q']);
        await restoreTrackedServiceProperties(context.repoRoot);
        return true;
      })
    : false;

  await runDeployStep(options?.printer, 'Running dockerDeploy', async () => {
    await runGradleTask(context, ['dockerDeploy', '-Pliferay.workspace.environment=dockerenv', '-q']);
  });

  const seededDockerenv = await seedBuildDockerConfigs(context);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  await writePrepareCommit(context, targetCommit);
  const artifacts = await listDeployArtifacts(context.buildDeployDir);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    repoRoot: context.repoRoot,
    liferayDir: context.liferayDir,
    buildDir: context.buildDir,
    targetCommit,
    buildServiceExecuted,
    dockerDeployExecuted: true,
    seededDockerenv,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
  };
}

export function formatDeployPrepare(result: DeployPrepareResult): string {
  return [
    `Prepared build/docker: ${result.buildDir}`,
    `Prepared commit: ${result.targetCommit}`,
    `buildService: ${result.buildServiceExecuted ? 'ran' : 'skipped'}`,
    `dockerDeploy: ${result.dockerDeployExecuted ? 'ran' : 'skipped'}`,
    `dockerenv copied: ${result.seededDockerenv ? 'yes' : 'no'}`,
    `artifacts in cache: ${result.artifactsCopiedToCache}`,
  ].join('\n');
}

async function ensurePrepareEnvStopped(
  config: AppConfig,
  options: {allowRunningEnv: boolean; processEnv?: NodeJS.ProcessEnv},
): Promise<void> {
  if (options.allowRunningEnv || !config.dockerDir) {
    return;
  }

  const envContext = resolveEnvContext(config);
  const status = await collectEnvStatus(envContext, {processEnv: options.processEnv});
  if (status.liferay?.state === 'running') {
    throw new CliError(
      'deploy prepare is blocked while Liferay is running. To avoid breaking the runtime, stop the environment or use --allow-running-env to force it.',
      {code: 'DEPLOY_RUNNING_ENV_BLOCKED'},
    );
  }
}
