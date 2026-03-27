import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';

const ACTIVATION_KEY_PATTERN = /^activation-key-.*\.xml$/i;

export type ActivationKeyResult = {
  applied: boolean;
  sourceFile: string | null;
  destinationFile: string | null;
};

export async function ensureActivationKeyPrepared(
  config: AppConfig,
  activationKeyFile: string | undefined,
): Promise<ActivationKeyResult> {
  const requestedFile = activationKeyFile?.trim() || process.env.LDEV_ACTIVATION_KEY_FILE?.trim();

  if (!requestedFile) {
    return {
      applied: false,
      sourceFile: null,
      destinationFile: null,
    };
  }

  if (!config.liferayDir) {
    throw new CliError('No se ha detectado liferay/ en el proyecto actual.', {code: 'ENV_ACTIVATION_KEY_NO_LIFERAY'});
  }

  const sourceFile = path.resolve(requestedFile);
  if (!(await fs.pathExists(sourceFile))) {
    throw new CliError(`No existe la activation key indicada: ${sourceFile}`, {code: 'ENV_ACTIVATION_KEY_NOT_FOUND'});
  }

  const fileName = path.basename(sourceFile);
  if (!ACTIVATION_KEY_PATTERN.test(fileName)) {
    throw new CliError(
      `La activation key debe llamarse activation-key-*.xml. Recibido: ${fileName}`,
      {code: 'ENV_ACTIVATION_KEY_INVALID_NAME'},
    );
  }

  const modulesDir = path.join(config.liferayDir, 'configs', 'dockerenv', 'osgi', 'modules');
  await fs.ensureDir(modulesDir);

  const existingEntries = await fs.readdir(modulesDir, {withFileTypes: true});
  await Promise.all(existingEntries
    .filter((entry) => entry.isFile() && ACTIVATION_KEY_PATTERN.test(entry.name) && entry.name !== fileName)
    .map((entry) => fs.remove(path.join(modulesDir, entry.name))));

  const destinationFile = path.join(modulesDir, fileName);
  const sameFile = path.normalize(sourceFile) === path.normalize(destinationFile);

  if (!sameFile) {
    await fs.copy(sourceFile, destinationFile, {overwrite: true});
  }

  return {
    applied: true,
    sourceFile,
    destinationFile,
  };
}
