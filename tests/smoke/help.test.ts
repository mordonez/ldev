import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';

const CLI_ENTRY = 'src/index.ts';
const CLI_CWD = process.cwd();

describe('smoke help', () => {
  test('--help works', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ldev');
    expect(result.stdout).toContain('Quick start');
    expect(result.stdout).toContain('Core commands:');
    expect(result.stdout).toContain('Workspace commands:');
    expect(result.stdout).toContain('Runtime commands:');
    expect(result.stdout).toContain('Liferay commands:');
    expect(result.stdout).toContain('db');
  }, 15000);

  test.each(['project', 'db', 'deploy', 'env', 'worktree', 'osgi', 'liferay', 'doctor', 'context'])('%s --help works', async (namespace) => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, namespace, '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(namespace);
  }, 15000);

  test('db --help documents destructive force import', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'db', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('import --force / sync --force');
  });

  test('liferay resource --help documents the normalized resource contract', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'resource', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Read:');
    expect(result.stdout).toContain('Export:');
    expect(result.stdout).toContain('Import:');
    expect(result.stdout).toContain('adt-types');
    expect(result.stdout).toContain('export-structures');
    expect(result.stdout).toContain('export-templates');
    expect(result.stdout).toContain('import-fragments');
    expect(result.stdout).toContain('import-structures');
    expect(result.stdout).toContain('migration-init');
    expect(result.stdout).not.toContain('Legacy aliases');
    expect(result.stdout).not.toContain('get-structure');
  });

  test('liferay inventory --help documents the discovery commands', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', 'inventory', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Discovery commands');
    expect(result.stdout).toContain('sites');
    expect(result.stdout).toContain('pages');
    expect(result.stdout).toContain('page');
    expect(result.stdout).toContain('structures');
    expect(result.stdout).toContain('templates');
  });

  test('liferay --help reflects the final public contract', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'liferay', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Connectivity and auth:');
    expect(result.stdout).toContain('Discovery:');
    expect(result.stdout).toContain('Resource workflows:');
    expect(result.stdout).toContain('Portal diagnostics:');
    expect(result.stdout).toContain('check');
    expect(result.stdout).toContain('auth');
    expect(result.stdout).toContain('inventory');
    expect(result.stdout).toContain('reindex');
    expect(result.stdout).toContain('page-layout');
    expect(result.stdout).toContain('resource');
    expect(result.stdout).not.toContain('audit');
    expect(result.stdout).not.toContain('theme');
    expect(result.stdout).not.toContain('health');
  });
});
