import net from 'node:net';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {normalizeProcessEnv, runProcess} from '../../core/platform/process.js';
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
  if (!config.dockerDir) {
    return runWorkspaceGogoCommand(config, command, processEnv);
  }

  const context = resolveOsgiContext(config);
  const normalizedEnv = normalizeProcessEnv(processEnv);
  const child = spawn(
    'docker',
    ['compose', 'exec', '-T', 'liferay', 'sh', '-lc', 'telnet localhost 11311'],
    {
      cwd: context.dockerDir,
      env: normalizedEnv,
      shell: process.platform === 'win32',
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
  await delay(2000);
  child.stdin.write('disconnect\n');
  child.stdin.end();

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError(stderr.trim() || stdout.trim() || `Could not execute Gogo command: ${command}`, {
      code: 'OSGI_GOGO_ERROR',
    });
  }

  return stdout.trimEnd();
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

async function runLocalGogoCommand(command: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const socket = net.createConnection({host: '127.0.0.1', port: 11311});
    let output = '';

    socket.setEncoding('utf8');
    socket.setTimeout(10_000);

    socket.on('data', (chunk) => {
      output += String(chunk);
    });

    socket.on('timeout', () => {
      socket.destroy();
      reject(new CliError(`Could not execute Gogo command: ${command}`, {code: 'OSGI_GOGO_ERROR'}));
    });

    socket.on('error', (error) => {
      reject(new CliError(String(error), {code: 'OSGI_GOGO_ERROR'}));
    });

    socket.on('connect', async () => {
      socket.write(`${command}\n`);
      await delay(2000);
      socket.end('disconnect\n');
    });

    socket.on('close', () => {
      resolve(output.trimEnd());
    });
  });
}

export async function openInteractiveGogo(config: AppConfig, processEnv?: NodeJS.ProcessEnv): Promise<void> {
  const context = resolveOsgiContext(config);
  const normalizedEnv = normalizeProcessEnv(processEnv);
  const child = spawn('docker', ['compose', 'exec', 'liferay', 'telnet', 'localhost', '11311'], {
    cwd: context.dockerDir,
    env: normalizedEnv,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

  if (exitCode !== 0) {
    throw new CliError('Could not open the Gogo shell.', {code: 'OSGI_GOGO_ERROR'});
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
