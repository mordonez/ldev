#!/usr/bin/env node

import {spawnSync} from 'node:child_process';

const diffResult = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR']);
const stagedFiles = diffResult.stdout
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter(Boolean);

const lintableFiles = stagedFiles.filter((file) => /\.(cts|mts|ts)$/i.test(file));

if (lintableFiles.length === 0) {
  process.exit(0);
}

run('npx', ['eslint', '--fix', ...lintableFiles], {stdio: 'inherit'});
run('npx', ['prettier', '--write', ...lintableFiles], {stdio: 'inherit'});
run('git', ['add', '--', ...lintableFiles], {stdio: 'inherit'});
// Full typecheck runs last so it sees the auto-fixed staged state
run('npx', ['tsc', '--noEmit'], {stdio: 'inherit'});

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{stdio?: import('node:child_process').StdioOptions}} [options]
 */
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    stdio: options.stdio ?? 'pipe',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }

  return {
    stdout: result.stdout,
  };
}
