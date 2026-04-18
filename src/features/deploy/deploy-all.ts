import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {runProcess} from '../../core/platform/process.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import {DeployErrors} from './errors/index.js';

import {
  ensureGradleWrapper,
  resolveDeployCacheDir,
  resolveDeployContext,
  resolveHeadCommit,
  readPrepareCommit,
  runDeployStep,
  runGradleTask,
  seedBuildDockerConfigs,
  syncArtifactsToDeployCache,
  syncArtifactsToBuildDeploy,
  listDeployArtifacts,
  writePrepareCommit,
} from './deploy-shared.js';

export type DeployAllResult = {
  ok: true;
  buildDir: string;
  targetCommit: string;
  seededDockerenv: boolean;
  artifactsCopiedToCache: number;
  cacheDir: string | null;
};

export async function runDeployAll(config: AppConfig, options?: {printer?: Printer}): Promise<DeployAllResult> {
  const project = resolveProjectContext({cwd: config.cwd});
  if (project.projectType === 'blade-workspace') {
    return runWorkspaceDeployAll(config, options);
  }

  const context = resolveDeployContext(config);
  await ensureGradleWrapper(context);

  const cacheDir = await resolveDeployCacheDir(config);
  const [cacheCommit, headCommit, cacheArtifacts] = await Promise.all([
    readPrepareCommit(cacheDir),
    resolveHeadCommit(context.repoRoot),
    listDeployArtifacts(cacheDir),
  ]);

  if (cacheCommit && cacheCommit === headCommit && cacheArtifacts.length > 0) {
    await runDeployStep(
      options?.printer,
      'Restoring from deploy cache (commit matches HEAD, skipping compile)',
      async () => {
        await syncArtifactsToBuildDeploy(context, cacheArtifacts);
      },
    );
  } else {
    await runDeployStep(options?.printer, 'Running dockerDeploy', async () => {
      await runGradleTask(context, ['dockerDeploy', '-Pliferay.workspace.environment=dockerenv']);
    });
  }

  const seededDockerenv = await seedBuildDockerConfigs(context);
  const targetCommit = await resolveHeadCommit(context.repoRoot);
  await writePrepareCommit(context, targetCommit);
  const artifacts = await listDeployArtifacts(context.buildDeployDir);
  const cache = await syncArtifactsToDeployCache(config, context, artifacts);

  return {
    ok: true,
    buildDir: context.buildDir,
    targetCommit,
    seededDockerenv,
    artifactsCopiedToCache: cache.copied,
    cacheDir: cache.cacheDir,
  };
}

export function formatDeployAll(result: DeployAllResult): string {
  if (result.cacheDir === null) {
    return [`Workspace deploy completed: ${result.buildDir}`, `Prepared commit: ${result.targetCommit}`].join('\n');
  }

  return [
    `Full deploy completed: ${result.buildDir}`,
    `Prepared commit: ${result.targetCommit}`,
    `dockerenv copied: ${result.seededDockerenv ? 'yes' : 'no'}`,
    `artifacts in cache: ${result.artifactsCopiedToCache}`,
  ].join('\n');
}

async function runWorkspaceDeployAll(config: AppConfig, options?: {printer?: Printer}): Promise<DeployAllResult> {
  const repoRoot = config.repoRoot;

  if (!repoRoot) {
    throw DeployErrors.workspaceRootNotFound('deploy all requires a workspace root.');
  }

  await runDeployStep(options?.printer, 'Running workspace deploy', async () => {
    const bladeResult = await runProcess('blade', ['gw', 'deploy'], {cwd: repoRoot, reject: false});

    if (bladeResult.ok) {
      return;
    }

    const gradlewPath = path.join(repoRoot, 'gradlew');
    const gradleResult = await runProcess(gradlewPath, ['--console=plain', 'deploy'], {
      cwd: repoRoot,
      reject: false,
    });

    if (!gradleResult.ok) {
      throw DeployErrors.gradleError(
        gradleResult.stderr.trim() ||
          gradleResult.stdout.trim() ||
          bladeResult.stderr.trim() ||
          bladeResult.stdout.trim(),
      );
    }
  });

  return {
    ok: true,
    buildDir: path.join(repoRoot, 'build'),
    targetCommit: await resolveWorkspaceTargetCommit(repoRoot),
    seededDockerenv: false,
    artifactsCopiedToCache: 0,
    cacheDir: null,
  };
}

async function resolveWorkspaceTargetCommit(repoRoot: string): Promise<string> {
  try {
    return await resolveHeadCommit(repoRoot);
  } catch {
    return 'workspace-unversioned';
  }
}
