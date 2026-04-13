import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import {runDocker} from '../../core/platform/docker.js';
import {readEnvFile} from '../../core/config/env-file.js';
import {resolveWorktreeContext} from '../worktree/worktree-paths.js';
import type {EnvContext} from './env-files.js';
import {resolveDataRoot} from './env-files.js';

export async function ensureDoclibVolume(
  context: EnvContext,
  options?: {processEnv?: NodeJS.ProcessEnv},
): Promise<{volumeName: string; devicePath: string; reused: boolean}> {
  const worktreeContext = resolveWorktreeContext(context.repoRoot);
  const mainDockerDir = worktreeContext.isWorktree
    ? path.join(worktreeContext.mainRepoRoot, 'docker')
    : context.dockerDir;
  const mainDockerEnvFile = path.join(mainDockerDir, '.env');
  const mainValues = readEnvFile(mainDockerEnvFile);
  const mainComposeProject = mainValues.COMPOSE_PROJECT_NAME || 'liferay';
  const mainDoclibVolume = mainValues.DOCLIB_VOLUME_NAME || `${mainComposeProject}-doclib`;
  const volumeName = context.envValues.DOCLIB_VOLUME_NAME || mainDoclibVolume;
  const devicePath = await resolveDesiredDoclibPath(
    context,
    worktreeContext.isWorktree ? mainDockerDir : context.dockerDir,
  );

  await fs.ensureDir(devicePath);

  const existingType = (
    await runDocker(['volume', 'inspect', volumeName, '--format', '{{index .Options "type"}}'], {
      env: options?.processEnv,
      reject: false,
    })
  ).stdout.trim();

  if (existingType === 'cifs') {
    return {
      volumeName,
      devicePath,
      reused: true,
    };
  }

  const existingDevice = (
    await runDocker(['volume', 'inspect', volumeName, '--format', '{{index .Options "device"}}'], {
      env: options?.processEnv,
      reject: false,
    })
  ).stdout.trim();

  if (existingDevice === devicePath) {
    return {
      volumeName,
      devicePath,
      reused: true,
    };
  }

  await runDocker(['volume', 'rm', volumeName], {env: options?.processEnv, reject: false});
  const createResult = await runDocker(
    [
      'volume',
      'create',
      '--driver',
      'local',
      '--opt',
      'type=none',
      '--opt',
      `device=${devicePath}`,
      '--opt',
      'o=bind',
      volumeName,
    ],
    {env: options?.processEnv, reject: false},
  );

  if (!createResult.ok) {
    throw new CliError(
      createResult.stderr.trim() || createResult.stdout.trim() || `Could not create volume ${volumeName}`,
      {
        code: 'ENV_DOCLIB_VOLUME_ERROR',
      },
    );
  }

  return {
    volumeName,
    devicePath,
    reused: false,
  };
}

function resolveSharedDoclibPath(mainDockerDir: string): string {
  const mainEnvFile = path.join(mainDockerDir, '.env');
  const mainValues = readEnvFile(mainEnvFile);
  const mainDataRoot = resolveDataRoot(mainDockerDir, mainValues.ENV_DATA_ROOT);

  return path.join(mainDataRoot, 'liferay-doclib');
}

async function resolveDesiredDoclibPath(context: EnvContext, mainDockerDir: string): Promise<string> {
  const configuredPath = context.envValues.DOCLIB_PATH?.trim();
  if (configuredPath) {
    const resolvedConfiguredPath = path.resolve(configuredPath);
    if (await fs.pathExists(resolvedConfiguredPath)) {
      return resolvedConfiguredPath;
    }
  }

  return resolveSharedDoclibPath(mainDockerDir);
}
