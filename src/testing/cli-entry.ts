/**
 * Resolves the CLI entry point for integration tests.
 *
 * When dist/index.js exists (CI builds before running tests, or developer ran npm run build),
 * tests use `node dist/index.js` instead of `npx tsx src/index.ts`. This reduces per-invocation
 * cost from ~2-3s (TypeScript compilation) to ~150ms (plain node startup).
 */
import {spawn} from 'node:child_process';
import type {ChildProcess} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import {normalizeProcessEnv, runProcess} from '../core/platform/process.js';

export const CLI_CWD = process.cwd();

const distEntry = path.join(CLI_CWD, 'dist', 'index.js');
const srcEntry = path.join(CLI_CWD, 'src', 'index.ts');

function resolveCliEntry() {
  const useCompiled = fs.existsSync(distEntry);

  return {
    useCompiled,
    entry: useCompiled ? distEntry : srcEntry,
  };
}

export const CLI_ENTRY = resolveCliEntry().entry;

export type CliResult = {exitCode: number; stdout: string; stderr: string};

/**
 * Spawn the CLI with the given arguments.
 * Uses `node dist/index.js` when built, `npx tsx src/index.ts` otherwise.
 */
export async function runCli(args: string[], options?: {cwd?: string; env?: NodeJS.ProcessEnv}): Promise<CliResult> {
  const {useCompiled, entry} = resolveCliEntry();
  if (useCompiled) {
    return runProcess('node', [entry, ...args], options);
  }
  return runProcess('npx', ['tsx', entry, ...args], options);
}

/**
 * Spawn the CLI as a streaming child process (for tests that need to read stdout incrementally).
 * Uses `node dist/index.js` when built, `npx tsx src/index.ts` otherwise.
 */
export function spawnCli(args: string[], options?: {cwd?: string; env?: NodeJS.ProcessEnv}): ChildProcess {
  const {useCompiled, entry} = resolveCliEntry();
  if (useCompiled) {
    return spawn('node', [entry, ...args], {
      cwd: options?.cwd,
      env: normalizeProcessEnv(options?.env),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }
  return spawn('npx', ['tsx', entry, ...args], {
    cwd: options?.cwd,
    env: normalizeProcessEnv(options?.env),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
