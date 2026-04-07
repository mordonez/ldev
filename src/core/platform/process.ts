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

export async function runProcess(
  command: string,
  args: string[] = [],
  options?: RunProcessOptions,
): Promise<RunProcessResult> {
  const result = await execa(command, args, {
    cwd: options?.cwd,
    env: options?.env,
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
