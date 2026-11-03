import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {ACTIVATION_KEY_PATTERN} from '../../core/runtime/activation-key.js';

export type ActivationKeyResult = {
  applied: boolean;
  sourceFile: string | null;
  destinationFile: string | null;
};

/**
 * Resolve the activation key path: explicit flag, then the process env, then
 * LDEV_ACTIVATION_KEY_FILE in docker/.env. The key lives outside the repo.
 */
export function resolveActivationKeySource(
  activationKeyFile: string | undefined,
  dockerEnvValues: Record<string, string> = {},
  processEnv: NodeJS.ProcessEnv = process.env,
): string | null {
  return (
    activationKeyFile?.trim() ||
    processEnv.LDEV_ACTIVATION_KEY_FILE?.trim() ||
    unquote(dockerEnvValues.LDEV_ACTIVATION_KEY_FILE) ||
    null
  );
}

/** docker/.env values are read raw; drop one pair of surrounding quotes. */
function unquote(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  return /^(["']).*\1$/.test(trimmed) ? trimmed.slice(1, -1) : trimmed;
}

/**
 * Install the activation key into the generated build configs
 * (liferay/build/docker/configs/dockerenv/osgi/modules), which are mounted into
 * the container and regenerated on every start. Run it after the build configs
 * are seeded; the key is never copied into the versioned source tree.
 */
export async function ensureActivationKeyPrepared(
  config: AppConfig,
  activationKeyFile: string | undefined,
  dockerEnvValues: Record<string, string> = {},
): Promise<ActivationKeyResult> {
  const requestedFile = resolveActivationKeySource(activationKeyFile, dockerEnvValues);

  if (!requestedFile) {
    return {
      applied: false,
      sourceFile: null,
      destinationFile: null,
    };
  }

  if (!config.liferayDir) {
    throw new CliError('Could not detect liferay/ in the current project.', {code: 'ENV_ACTIVATION_KEY_NO_LIFERAY'});
  }

  const sourceFile = path.resolve(config.repoRoot ?? config.cwd, requestedFile);
  if (!(await fs.pathExists(sourceFile))) {
    throw new CliError(`The requested activation key does not exist: ${sourceFile}`, {
      code: 'ENV_ACTIVATION_KEY_NOT_FOUND',
    });
  }

  const fileName = path.basename(sourceFile);
  if (!ACTIVATION_KEY_PATTERN.test(fileName)) {
    throw new CliError(`The activation key must be named activation-key-*.xml. Received: ${fileName}`, {
      code: 'ENV_ACTIVATION_KEY_INVALID_NAME',
    });
  }

  const modulesDir = path.join(config.liferayDir, 'build', 'docker', 'configs', 'dockerenv', 'osgi', 'modules');
  await fs.ensureDir(modulesDir);

  const existingEntries = await fs.readdir(modulesDir, {withFileTypes: true});
  await Promise.all(
    existingEntries
      .filter((entry) => entry.isFile() && ACTIVATION_KEY_PATTERN.test(entry.name) && entry.name !== fileName)
      .map((entry) => fs.remove(path.join(modulesDir, entry.name))),
  );

  const destinationFile = path.join(modulesDir, fileName);
  await fs.copy(sourceFile, destinationFile, {overwrite: true});

  return {
    applied: true,
    sourceFile,
    destinationFile,
  };
}
