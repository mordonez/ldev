import fs from 'fs-extra';
import path from 'node:path';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {readEnvFile, upsertEnvFileValues} from '../../core/config/env-file.js';
import type {Printer} from '../../core/output/printer.js';
import {runDocker} from '../../core/platform/docker.js';
import {resolveEnvContext, resolveDataRoot} from '../env/env-files.js';

export type DbFilesMountResult = {
  ok: true;
  volume: string;
  mode: 'local' | 'nas' | 'default';
  path: string | null;
};

export async function runDbFilesMount(
  config: AppConfig,
  options?: {path?: string; printer?: Printer},
): Promise<DbFilesMountResult> {
  if (!config.dockerDir || !config.files.dockerEnv) {
    throw new CliError('db files-mount must be run inside a project with docker/.', {
      code: 'DB_REPO_NOT_FOUND',
    });
  }

  const envContext = resolveEnvContext(config);
  const envFile = config.files.dockerEnv;
  const envValues = readEnvFile(envFile);
  const volume = await ensureDoclibVolumeName(envFile, envValues);
  const requestedPath = options?.path?.trim() || envValues.DOCLIB_PATH || '';
  const nasIp = envValues.DOCLIB_NAS_IP || '';
  const nasShare = envValues.DOCLIB_NAS_SHARE || '';
  const nasUser = envValues.DOCLIB_NAS_USER || '';
  const nasPass = envValues.DOCLIB_NAS_PASS || '';
  const nasPort = envValues.DOCLIB_NAS_PORT || '10445';

  if (requestedPath !== '') {
    const resolvedPath = path.resolve(requestedPath);
    if (await fs.pathExists(resolvedPath)) {
      await recreateDockerVolume(volume);
      await createLocalBindVolume(volume, resolvedPath);
      await updateEnvFile(envFile, {DOCLIB_PATH: resolvedPath});
      return {
        ok: true,
        volume,
        mode: 'local',
        path: resolvedPath,
      };
    }
  }

  if (nasIp !== '') {
    if (nasShare === '' || nasUser === '') {
      throw new CliError('DOCLIB_NAS_IP requires both DOCLIB_NAS_SHARE and DOCLIB_NAS_USER.', {
        code: 'DB_DOCLIB_NAS_INVALID',
      });
    }

    await recreateDockerVolume(volume);
    await createNasVolume(volume, {
      nasIp,
      nasShare,
      nasUser,
      nasPass,
      nasPort,
    });
    return {
      ok: true,
      volume,
      mode: 'nas',
      path: `//${nasIp}/${nasShare}`,
    };
  }

  const defaultDoclibDir = path.join(
    resolveDataRoot(envContext.dockerDir, envContext.envValues.ENV_DATA_ROOT),
    'liferay-doclib',
  );
  await fs.ensureDir(defaultDoclibDir);
  await ensureDefaultBindVolume(volume, defaultDoclibDir);

  return {
    ok: true,
    volume,
    mode: 'default',
    path: defaultDoclibDir,
  };
}

export function formatDbFilesMount(result: DbFilesMountResult): string {
  if (result.mode === 'local') {
    return `Doclib volume ${result.volume} mounted from local path: ${result.path}`;
  }
  if (result.mode === 'nas') {
    return `Doclib volume ${result.volume} mounted from NAS: ${result.path}`;
  }
  return `Doclib volume ${result.volume} ready`;
}

async function ensureDoclibVolumeName(envFile: string, envValues: Record<string, string>): Promise<string> {
  const volume = envValues.DOCLIB_VOLUME_NAME || `${envValues.COMPOSE_PROJECT_NAME || 'liferay'}-doclib`;
  if (!envValues.DOCLIB_VOLUME_NAME) {
    await updateEnvFile(envFile, {DOCLIB_VOLUME_NAME: volume});
  }
  return volume;
}

async function ensureDefaultBindVolume(volume: string, doclibDir: string): Promise<void> {
  const existingType = (
    await runDocker(['volume', 'inspect', volume, '--format', '{{index .Options "type"}}'], {reject: false})
  ).stdout.trim();
  if (existingType === 'cifs') {
    return;
  }

  const existingDevice = (
    await runDocker(['volume', 'inspect', volume, '--format', '{{index .Options "device"}}'], {reject: false})
  ).stdout.trim();
  const resolved = path.resolve(doclibDir);
  if (existingDevice === resolved) {
    return;
  }

  await recreateDockerVolume(volume);
  await createLocalBindVolume(volume, resolved);
}

async function createLocalBindVolume(volume: string, localPath: string): Promise<void> {
  const result = await runDocker(
    [
      'volume',
      'create',
      '--driver',
      'local',
      '--opt',
      'type=none',
      '--opt',
      `device=${localPath}`,
      '--opt',
      'o=bind',
      volume,
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `Could not create volume ${volume}`, {
      code: 'DB_DOCLIB_VOLUME_ERROR',
    });
  }
}

async function createNasVolume(
  volume: string,
  options: {
    nasIp: string;
    nasShare: string;
    nasUser: string;
    nasPass: string;
    nasPort: string;
  },
): Promise<void> {
  const result = await runDocker(
    [
      'volume',
      'create',
      '--driver',
      'local',
      '--opt',
      'type=cifs',
      '--opt',
      `device=//${options.nasIp}/${options.nasShare}`,
      '--opt',
      `o=username=${options.nasUser},password=${options.nasPass},uid=1000,gid=1000,vers=3.0,port=${options.nasPort}`,
      volume,
    ],
    {reject: false},
  );
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `Could not create CIFS volume ${volume}`, {
      code: 'DB_DOCLIB_VOLUME_ERROR',
    });
  }
}

async function recreateDockerVolume(volume: string): Promise<void> {
  await runDocker(['volume', 'rm', volume], {reject: false});
}

async function updateEnvFile(envFile: string, values: Record<string, string>): Promise<void> {
  const currentContent = await fs.readFile(envFile, 'utf8').catch(() => '');
  const updatedContent = upsertEnvFileValues(currentContent, values);
  await fs.writeFile(envFile, `${updatedContent}\n`);
}
