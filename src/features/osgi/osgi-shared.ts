import path from 'node:path';
import {spawn} from 'node:child_process';

import fs from 'fs-extra';

import {CliError} from '../../cli/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose, runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveEnvContext} from '../env/env-files.js';

export function resolveOsgiContext(config: AppConfig) {
  const envContext = resolveEnvContext(config);
  const postgresUser = envContext.envValues.POSTGRES_USER || 'liferay';
  const postgresDb = envContext.envValues.POSTGRES_DB || 'liferay';

  return {
    ...envContext,
    postgresUser,
    postgresDb,
  };
}

export async function runGogoCommand(
  config: AppConfig,
  command: string,
  processEnv?: NodeJS.ProcessEnv,
): Promise<string> {
  const context = resolveOsgiContext(config);
  const child = spawn(
    'docker',
    ['compose', 'exec', '-T', 'liferay', 'sh', '-lc', 'telnet localhost 11311 2>/dev/null'],
    {
      cwd: context.dockerDir,
      env: processEnv,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += String(chunk);
  });
  child.stderr.on('data', (chunk) => {
    stderr += String(chunk);
  });

  child.stdin.write(`${command}\n`);
  child.stdin.write('disconnect\n');
  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError(stderr.trim() || stdout.trim() || `No se pudo ejecutar comando Gogo: ${command}`, {
      code: 'OSGI_GOGO_ERROR',
    });
  }

  return stdout.trimEnd();
}

export async function openInteractiveGogo(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const context = resolveOsgiContext(config);
  const child = spawn('docker', ['compose', 'exec', 'liferay', 'telnet', 'localhost', '11311'], {
    cwd: context.dockerDir,
    env: processEnv,
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError('No se pudo abrir el Gogo shell.', {code: 'OSGI_GOGO_ERROR'});
  }
}

export async function runLiferayScript(
  config: AppConfig,
  script: string,
  args: string[],
  processEnv?: NodeJS.ProcessEnv,
): Promise<void> {
  const context = resolveOsgiContext(config);
  await runDockerComposeOrThrow(context.dockerDir, ['exec', 'liferay', script, ...args], {env: processEnv});
}

export async function queryOAuth2ClientCredentials(
  config: AppConfig,
  externalReferenceCode: string,
  processEnv?: NodeJS.ProcessEnv,
): Promise<{clientId: string; clientSecret: string} | null> {
  const context = resolveOsgiContext(config);
  const escapedErc = externalReferenceCode.replaceAll("'", "''");
  const result = await runDockerCompose(
    context.dockerDir,
    [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      context.postgresUser,
      '-d',
      context.postgresDb,
      '-t',
      '-A',
      '-c',
      `SELECT clientid || '|' || clientsecret FROM OAuth2Application WHERE externalreferencecode = '${escapedErc}' LIMIT 1;`,
    ],
    {env: processEnv, reject: false},
  );

  if (!result.ok) {
    return null;
  }

  const row = result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line !== '');

  if (!row || !row.includes('|')) {
    return null;
  }

  const [clientId, clientSecret] = row.split('|', 2);
  return {clientId, clientSecret};
}

export async function resolveLiferayCliExternalReferenceCode(config: AppConfig): Promise<string> {
  const configured = process.env.LIFERAY_CLI_OAUTH2_EXTERNAL_REFERENCE_CODE?.trim();
  if (configured) {
    return configured;
  }

  if (!config.liferayDir) {
    return 'liferay-cli';
  }

  for (const filePath of [
    path.join(
      config.liferayDir,
      'configs',
      'dockerenv',
      'osgi',
      'configs',
      'dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration.config',
    ),
    path.join(
      config.liferayDir,
      'configs',
      'local',
      'osgi',
      'configs',
      'dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration.config',
    ),
    path.join(
      config.liferayDir,
      'configs',
      'common',
      'osgi',
      'configs',
      'dev.mordonez.liferay.cli.bootstrap.configuration.LiferayCliOAuth2BootstrapConfiguration.config',
    ),
  ]) {
    if (!(await fs.pathExists(filePath))) {
      continue;
    }

    const content = await fs.readFile(filePath, 'utf8');
    const match = content.match(/^externalReferenceCode=(.+)$/m);
    if (match?.[1]) {
      return match[1].replaceAll('"', '').trim();
    }
  }

  return 'liferay-cli';
}
