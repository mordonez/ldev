import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import {loadConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/printer.js';
import {ensureEnvDataLayout, resolveDataRoot, resolveEnvContext, seedBuildDockerConfigs} from '../env/env-files.js';
import {resolveWorktreeContext, resolveWorktreeTarget, resolvePortSet, type WorktreeTarget} from './worktree-paths.js';
import {cloneInitialWorktreeState, resolveBtrfsConfig, worktreeEnvHasState} from './worktree-state.js';

export type WorktreeEnvResult = {
  ok: true;
  worktreeName: string;
  worktreeDir: string;
  dockerDir: string;
  envFile: string;
  composeProjectName: string;
  portalUrl: string;
  dataRoot: string;
  ports: {
    httpPort: string;
    debugPort: string;
    gogoPort: string;
    postgresPort: string;
    esHttpPort: string;
  };
  createdEnvFile: boolean;
  clonedState: boolean;
  btrfsEnabled: boolean;
};

export async function runWorktreeEnv(options: {
  cwd: string;
  name?: string;
  printer?: Printer;
}): Promise<WorktreeEnvResult> {
  const config = loadConfig({cwd: options.cwd, env: process.env});
  if (!config.repoRoot) {
    throw new CliError('No se ha detectado un repositorio válido para worktree env.', {
      code: 'WORKTREE_REPO_NOT_FOUND',
    });
  }

  const context = resolveWorktreeContext(config.repoRoot);
  const target = resolveTarget(context, options.name);
  const mainConfig = loadConfig({cwd: context.mainRepoRoot, env: process.env});
  const mainEnvContext = resolveEnvContext(mainConfig);
  const sourceEnvFile = (await fs.pathExists(mainEnvContext.dockerEnvFile))
    ? mainEnvContext.dockerEnvFile
    : mainEnvContext.dockerEnvExampleFile;

  await fs.ensureDir(target.dockerDir);

  let createdEnvFile = false;
  if (sourceEnvFile && !(await fs.pathExists(target.envFile))) {
    await fs.copy(sourceEnvFile, target.envFile);
    createdEnvFile = true;
  } else if (!(await fs.pathExists(target.envFile))) {
    await fs.writeFile(target.envFile, '');
    createdEnvFile = true;
  }

  const currentContent = await fs.readFile(target.envFile, 'utf8');
  const currentValues = readEnvFile(target.envFile);
  const mainValues = readEnvFile(mainEnvContext.dockerEnvFile);
  const btrfs = await resolveBtrfsConfig(mainEnvContext, mainValues);
  const ports = resolvePortSet(target.name);
  const bindIp = currentValues.BIND_IP || mainValues.BIND_IP || '127.0.0.1';
  const mainComposeProject = mainValues.COMPOSE_PROJECT_NAME || 'liferay';
  const envDataRoot = btrfs.enabled
    ? path.join(btrfs.envsDir ?? path.join(mainEnvContext.dockerDir, 'btrfs', 'envs'), target.name)
    : path.join(target.dockerDir, 'data', 'envs', target.name);
  const nextValues = {
    BIND_IP: bindIp,
    LIFERAY_CLI_URL: `http://${bindIp}:${ports.httpPort}`,
    COMPOSE_PROJECT_NAME: `${mainComposeProject}-${target.name}`,
    VOLUME_PREFIX: `${mainComposeProject}-${target.name}`,
    DOCLIB_VOLUME_NAME: mainValues.DOCLIB_VOLUME_NAME || `${mainComposeProject}-doclib`,
    LIFERAY_HTTP_PORT: ports.httpPort,
    LIFERAY_DEBUG_PORT: ports.debugPort,
    GOGO_PORT: ports.gogoPort,
    POSTGRES_PORT: ports.postgresPort,
    ES_HTTP_PORT: ports.esHttpPort,
    ENV_DATA_ROOT: envDataRoot,
    ...(btrfs.enabled && btrfs.rootDir && btrfs.baseDir && btrfs.envsDir && btrfs.useSnapshots
      ? {
          BTRFS_ROOT: btrfs.rootDir,
          BTRFS_BASE: btrfs.baseDir,
          BTRFS_ENVS: btrfs.envsDir,
          USE_BTRFS_SNAPSHOTS: btrfs.useSnapshots,
        }
      : {}),
  };

  const updated = upsertEnvFileValues(currentContent, nextValues);
  await fs.writeFile(target.envFile, updated === '' ? '' : `${updated}\n`);

  const clonedState = !(await worktreeEnvHasState(envDataRoot))
    ? await cloneInitialWorktreeState({
        mainEnvContext,
        targetDataRoot: envDataRoot,
        btrfs,
      })
    : false;

  const worktreeConfig = loadConfig({cwd: target.worktreeDir, env: process.env});
  const worktreeEnvContext = resolveEnvContext(worktreeConfig);
  await ensureEnvDataLayout(worktreeEnvContext);
  await seedBuildDockerConfigs(worktreeEnvContext);
  await ensurePortalExtLocalOverride(target.worktreeDir, ports.httpPort);

  if (options.printer) {
    options.printer.info(`Worktree env preparado: ${target.name} (${ports.httpPort})`);
  }

  return {
    ok: true,
    worktreeName: target.name,
    worktreeDir: target.worktreeDir,
    dockerDir: target.dockerDir,
    envFile: target.envFile,
    composeProjectName: `${mainComposeProject}-${target.name}`,
    portalUrl: `http://${bindIp}:${ports.httpPort}`,
    dataRoot: resolveDataRoot(target.dockerDir, envDataRoot),
    ports,
    createdEnvFile,
    clonedState,
    btrfsEnabled: btrfs.enabled,
  };
}

export function formatWorktreeEnv(result: WorktreeEnvResult): string {
  return [
    `Worktree env OK: ${result.worktreeName}`,
    `Worktree: ${result.worktreeDir}`,
    `Portal URL: ${result.portalUrl}`,
    `Compose project: ${result.composeProjectName}`,
    `ENV_DATA_ROOT: ${result.dataRoot}`,
    `Estado inicial clonado: ${result.clonedState ? 'sí' : 'no'}`,
  ].join('\n');
}

function resolveTarget(context: ReturnType<typeof resolveWorktreeContext>, name?: string): WorktreeTarget {
  if (name && name.trim() !== '') {
    return resolveWorktreeTarget(context.mainRepoRoot, name);
  }

  if (!context.isWorktree || !context.currentWorktreeName) {
    throw new CliError('worktree env debe ejecutarse dentro de un worktree o recibir --name.', {
      code: 'WORKTREE_NAME_REQUIRED',
    });
  }

  return resolveWorktreeTarget(context.mainRepoRoot, context.currentWorktreeName);
}

async function ensurePortalExtLocalOverride(worktreeDir: string, httpPort: string): Promise<void> {
  const sourceDir = path.join(worktreeDir, 'liferay', 'configs', 'dockerenv');
  const buildDir = path.join(worktreeDir, 'liferay', 'build', 'docker', 'configs', 'dockerenv');
  const content = `web.server.http.port=${httpPort}\n`;

  await fs.ensureDir(sourceDir);
  await fs.ensureDir(buildDir);
  await fs.writeFile(path.join(sourceDir, 'portal-ext.local.properties'), content);
  await fs.writeFile(path.join(buildDir, 'portal-ext.local.properties'), content);
}
