import net from 'node:net';
import {setTimeout as delay} from 'node:timers/promises';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerCompose, runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {runProcess} from '../../core/platform/process.js';
import {resolveEnvContext} from '../env/env-shared.js';

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
  if (!config.dockerDir) {
    return runWorkspaceGogoCommand(config, command, processEnv);
  }

  const context = resolveOsgiContext(config);

  const result = await runDockerCompose(
    context.dockerDir,
    [
      'exec',
      '-T',
      'liferay',
      'sh',
      '-lc',
      `{ printf '%s\\n' ${shellSingleQuote(command)} 'disconnect' 'y'; sleep 30; } | telnet localhost 11311 2>/dev/null`,
    ],
    {
      env: processEnv,
      reject: false,
      timeoutMs: 45_000,
    },
  );

  const output = sanitizeGogoOutput(result.stdout);

  if (!result.ok && !output) {
    throw new CliError(result.stderr.trim() || `Could not execute Gogo command: ${command}`, {
      code: 'OSGI_GOGO_ERROR',
    });
  }

  return output;
}

async function runWorkspaceGogoCommand(
  config: AppConfig,
  command: string,
  processEnv?: NodeJS.ProcessEnv,
): Promise<string> {
  if (config.repoRoot) {
    const bladeResult = await runProcess('blade', ['sh', command], {
      cwd: config.repoRoot,
      env: processEnv,
      reject: false,
    });

    if (bladeResult.ok) {
      return bladeResult.stdout.trimEnd();
    }
  }

  return runLocalGogoCommand(command);
}

async function runLocalGogoCommand(command: string, host = '127.0.0.1', port = 11311): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({host, port});
    let output = '';

    socket.setEncoding('utf8');
    socket.setTimeout(20_000);

    socket.on('data', (chunk) => {
      output += String(chunk);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new CliError(`Could not execute Gogo command: ${command}`, {code: 'OSGI_GOGO_ERROR'}));
    });

    socket.on('error', (error) => {
      reject(new CliError(`Gogo socket error executing '${command}': ${String(error)}`, {code: 'OSGI_GOGO_ERROR'}));
    });

    socket.on('connect', async () => {
      socket.write(`${command}\n`);
      await delay(2000);
      socket.end('disconnect\n');
    });

    socket.on('close', () => {
      resolve(sanitizeGogoOutput(output));
    });
  });
}

export async function openInteractiveGogo(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const context = resolveOsgiContext(config);
  await runDockerComposeOrThrow(context.dockerDir, ['exec', 'liferay', 'telnet', 'localhost', '11311'], {
    env: processEnv,
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
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

export function sanitizeGogoOutput(output: string): string {
  const cleaned = output
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => {
      const trimmed = line.trim();
      if (trimmed === '') {
        return false;
      }
      return !trimmed.startsWith('telnet>');
    });

  return cleaned.join('\n').trimEnd();
}

export function looksLikeTelnetBannerOnly(output: string): boolean {
  if (output.trim() === '') {
    return true;
  }

  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');

  if (lines.length === 0) {
    return true;
  }

  return lines.every(
    (line) => line.startsWith('Trying ') || line.startsWith('Connected to ') || line.startsWith('Escape character '),
  );
}

function shellSingleQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}
