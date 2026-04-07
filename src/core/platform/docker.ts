import {CliError} from '../../core/errors.js';
import {runProcess, type RunProcessOptions, type RunProcessResult} from './process.js';

export async function isDockerAvailable(env?: NodeJS.ProcessEnv): Promise<boolean> {
  const result = await runProcess('docker', ['version', '--format', 'json'], {env});
  return result.ok;
}

export async function isDockerComposeAvailable(env?: NodeJS.ProcessEnv): Promise<boolean> {
  const result = await runProcess('docker', ['compose', 'version'], {env});
  return result.ok;
}

export async function runDocker(args: string[], options?: RunProcessOptions): Promise<RunProcessResult> {
  return runProcess('docker', args, options);
}

export async function runDockerCompose(
  cwd: string,
  args: string[],
  options?: RunProcessOptions,
): Promise<RunProcessResult> {
  return runProcess('docker', ['compose', ...args], {
    ...options,
    cwd,
  });
}

export async function runDockerOrThrow(args: string[], options?: RunProcessOptions): Promise<RunProcessResult> {
  const result = await runDocker(args, options);
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `docker ${args.join(' ')}`, {
      code: 'DOCKER_ERROR',
    });
  }

  return result;
}

export async function runDockerComposeOrThrow(
  cwd: string,
  args: string[],
  options?: RunProcessOptions,
): Promise<RunProcessResult> {
  const result = await runDockerCompose(cwd, args, options);
  if (!result.ok) {
    throw new CliError(result.stderr.trim() || result.stdout.trim() || `docker compose ${args.join(' ')}`, {
      code: 'DOCKER_COMPOSE_ERROR',
    });
  }

  return result;
}
