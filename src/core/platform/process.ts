import fs from 'node:fs';
import path from 'node:path';
import {spawn, type ChildProcess, type SpawnOptions} from 'node:child_process';

import {execa} from 'execa';

export type RunProcessOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  timeoutMs?: number;
  reject?: boolean;
  stdin?: 'ignore' | 'inherit' | 'pipe';
  stdout?: 'pipe' | 'inherit';
  stderr?: 'pipe' | 'inherit';
  input?: string | Buffer;
};

export type RunProcessResult = {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  ok: boolean;
};

export type RunInteractiveProcessOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
};

export type SpawnedProcess = ChildProcess & {
  stdin: NodeJS.WritableStream;
  stdout: NodeJS.ReadableStream;
  stderr: NodeJS.ReadableStream;
  kill(signal?: NodeJS.Signals | number): boolean;
};

export type SpawnProcessFn = (command: string, args: string[], options: SpawnOptions) => SpawnedProcess;

function normalizePathValue(value: string | undefined): string | undefined {
  if (!value || process.platform !== 'win32') {
    return value;
  }

  return value.replace(/:(?=[A-Za-z]:[\\/])/g, ';');
}

export function normalizeProcessEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv | undefined {
  if (!env) {
    return env;
  }

  const normalizedPath = normalizePathValue(env.PATH ?? env.Path);

  return {
    ...env,
    PATH: normalizedPath,
    Path: normalizedPath,
  };
}

export function resolveSpawnCommand(command: string, env?: NodeJS.ProcessEnv): string {
  if (process.platform !== 'win32') {
    return command;
  }

  if (command.includes('\\') || command.includes('/') || path.extname(command) !== '') {
    return command;
  }

  const normalizedEnv = normalizeProcessEnv(env);
  const pathValue = normalizedEnv?.Path ?? normalizedEnv?.PATH ?? process.env.Path ?? process.env.PATH ?? '';
  const pathEntries = pathValue
    .split(';')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
  const pathExts = (normalizedEnv?.PATHEXT ?? process.env.PATHEXT ?? '.COM;.EXE;.BAT;.CMD')
    .split(';')
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => entry !== '');

  for (const dir of pathEntries) {
    for (const ext of pathExts) {
      const candidate = path.join(dir, `${command}${ext}`);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return command;
}

export function formatProcessError(result: RunProcessResult, fallback: string): string {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

export function spawnPipedProcess(
  command: string,
  args: string[] = [],
  options?: SpawnOptions,
  spawnFn: SpawnProcessFn = spawn as SpawnProcessFn,
): SpawnedProcess {
  return spawnFn(command, args, options ?? {});
}

export function spawnDetachedProcess(command: string, args: string[] = [], options?: SpawnOptions): ChildProcess {
  return spawn(command, args, options ?? {});
}

export async function runProcess(
  command: string,
  args: string[] = [],
  options?: RunProcessOptions,
): Promise<RunProcessResult> {
  const result = await execa(command, args, {
    cwd: options?.cwd,
    env: normalizeProcessEnv(options?.env),
    input: options?.input,
    timeout: options?.timeoutMs,
    reject: options?.reject ?? false,
    stdin: options?.stdin ?? (options?.input !== undefined ? 'pipe' : 'ignore'),
    stdout: options?.stdout ?? 'pipe',
    stderr: options?.stderr ?? 'pipe',
  });

  return {
    command: [command, ...args].join(' '),
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    exitCode: result.exitCode ?? 1,
    ok: result.exitCode === 0,
  };
}

export async function runInteractiveProcess(
  command: string,
  args: string[] = [],
  options?: RunInteractiveProcessOptions,
): Promise<RunProcessResult> {
  const resolvedCommand = resolveSpawnCommand(command, options?.env);
  const result = await execa(resolvedCommand, args, {
    cwd: options?.cwd,
    env: normalizeProcessEnv(options?.env),
    reject: false,
    shell: process.platform === 'win32',
    stdio: 'inherit',
  });

  return {
    command: [command, ...args].join(' '),
    stdout: '',
    stderr: '',
    exitCode: result.exitCode ?? 1,
    ok: result.exitCode === 0,
  };
}
