import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {upsertEnvFileValues} from '../../core/config/env-file.js';

import {queryOAuth2ClientCredentials, resolveLiferayCliExternalReferenceCode} from './osgi-shared.js';

export type OsgiLiferayCliCredsResult = {
  ok: true;
  externalReferenceCode: string;
  dockerEnvUpdated: boolean;
  dockerEnvFile: string | null;
  readWrite: {
    clientId: string;
    clientSecret: string;
  };
  readOnly: {
    clientId: string;
    clientSecret: string;
  } | null;
};

export async function runOsgiLiferayCliCreds(
  config: AppConfig,
  options?: {writeEnv?: boolean},
): Promise<OsgiLiferayCliCredsResult> {
  const externalReferenceCode = await resolveLiferayCliExternalReferenceCode(config);
  const readWrite = await queryOAuth2ClientCredentials(config, externalReferenceCode, process.env);
  if (!readWrite) {
    throw new CliError(`App OAuth2 '${externalReferenceCode}' no encontrada.`, {code: 'OSGI_OAUTH2_APP_NOT_FOUND'});
  }

  const dockerEnvFile = config.files.dockerEnv ?? null;
  const dockerEnvUpdated = options?.writeEnv === true
    ? await writeCredentialsToDockerEnv(dockerEnvFile, readWrite.clientId, readWrite.clientSecret)
    : false;

  return {
    ok: true,
    externalReferenceCode,
    dockerEnvUpdated,
    dockerEnvFile,
    readWrite,
    readOnly: await queryOAuth2ClientCredentials(config, `${externalReferenceCode}-readonly`, process.env),
  };
}

export function formatOsgiLiferayCliCreds(result: OsgiLiferayCliCredsResult): string {
  const lines = result.dockerEnvUpdated && result.dockerEnvFile
    ? [`docker/.env actualizado: ${result.dockerEnvFile}`, '']
    : [];

  lines.push(
    `LIFERAY_CLI_OAUTH2_CLIENT_ID=${result.readWrite.clientId}`,
    `LIFERAY_CLI_OAUTH2_CLIENT_SECRET=${result.readWrite.clientSecret}`,
  );

  if (result.readOnly) {
    lines.push('');
    lines.push('--- App read-only (solo lectura) ---');
    lines.push(`LIFERAY_CLI_OAUTH2_CLIENT_ID=${result.readOnly.clientId}`);
    lines.push(`LIFERAY_CLI_OAUTH2_CLIENT_SECRET=${result.readOnly.clientSecret}`);
  }

  return lines.join('\n');
}

async function writeCredentialsToDockerEnv(
  dockerEnvFile: string | null,
  clientId: string,
  clientSecret: string,
): Promise<boolean> {
  if (!dockerEnvFile) {
    throw new CliError('No se ha detectado docker/.env para persistir las credenciales OAuth2.', {
      code: 'OSGI_DOCKER_ENV_NOT_FOUND',
    });
  }

  const currentContent = await fs.readFile(dockerEnvFile, 'utf8').catch(() => '');
  const updatedContent = upsertEnvFileValues(currentContent, {
    LIFERAY_CLI_OAUTH2_CLIENT_ID: clientId,
    LIFERAY_CLI_OAUTH2_CLIENT_SECRET: clientSecret,
  });
  await fs.writeFile(dockerEnvFile, `${updatedContent}\n`);
  return true;
}
