import {describe, expect, test} from 'vitest';
import {readFileSync} from 'node:fs';
import path from 'node:path';

import {runCli} from '../../src/testing/cli-entry.js';
import {createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(CLI_CWD, 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
const README_TEXT = readFileSync(path.join(CLI_CWD, 'README.md'), 'utf8');
const INSTALL_DOC_TEXT = readFileSync(path.join(CLI_CWD, 'docs', 'getting-started', 'quickstart.md'), 'utf8');

describe('smoke help', () => {
  test('--help works', async () => {
    const result = await runCli(['--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ldev');
    expect(result.stdout).toContain('Core workflows:');
    expect(result.stdout).toContain('Project bootstrap:');
    expect(result.stdout).toContain('Liferay API tooling:');
    expect(result.stdout).toContain('Advanced local tooling:');
    expect(result.stdout).toContain('db');
    expect(result.stdout).toContain('Detected project type: unknown');
    expect(result.stdout).toContain('Recommended paths from here:');
    expect(result.stdout).toContain('context');
  }, 30000);

  test('invoking ldev without arguments shows contextual root help', async () => {
    const result = await runCli([], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: unknown');
    expect(result.stdout).not.toContain('Core workflows:');
    expect(result.stdout).toContain('Agent-core entry points:');
    expect(result.stdout).toContain('ldev resource export-structures --site /global');
    expect(result.stdout).toContain("Run 'ldev --help' to see the full command catalog.");
    expect(result.stdout).toContain('blade init ai-workspace');
    expect(result.stdout).toContain('ldev project init --name my-project --dir ~/projects/my-project');
  }, 30000);

  test('bare ldev adapts its short summary to blade-workspace', async () => {
    const targetDir = createTempWorkspace();

    const result = await runCli([], {cwd: targetDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: blade-workspace');
    expect(result.stdout).not.toContain('Core workflows:');
    expect(result.stdout).toContain('Runtime-core here:');
    expect(result.stdout).toContain('ldev deploy all');
    expect(result.stdout).toContain('Advanced or partial here:');
    expect(result.stdout).toContain('ldev db ...');
  }, 30000);

  test('bare ldev adapts its short summary to ldev-native', async () => {
    const targetDir = createTempRepo();

    const result = await runCli([], {cwd: targetDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: ldev-native');
    expect(result.stdout).not.toContain('Core workflows:');
    expect(result.stdout).toContain('Runtime-core here:');
    expect(result.stdout).toContain('ldev setup');
    expect(result.stdout).toContain('ldev db query ...');
  }, 30000);

  test('root help adapts to blade-workspace', async () => {
    const targetDir = createTempWorkspace();

    const result = await runCli(['--help'], {cwd: targetDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: blade-workspace');
    expect(result.stdout).toContain('Recommended first steps for this Workspace:');
    expect(result.stdout).toContain('ldev deploy all');
    expect(result.stdout).toContain('ldev resource export-structures --site /global');
    expect(result.stdout).toContain('ldev portal check --json');
  }, 30000);

  test('root help adapts to ldev-native', async () => {
    const targetDir = createTempRepo();

    const result = await runCli(['--help'], {cwd: targetDir});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: ldev-native');
    expect(result.stdout).toContain('Recommended first steps for this ldev-native repo:');
    expect(result.stdout).toContain('ldev setup');
    expect(result.stdout).toContain('ldev oauth install --write-env');
    expect(result.stdout).toContain('ldev resource export-structures --site /global');
  }, 30000);

  test('root help honors top-level --repo-root and documents REPO_ROOT', async () => {
    const targetDir = createTempRepo();

    const result = await runCli(['--repo-root', targetDir, '--help'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Detected project type: ldev-native');
    expect(result.stdout).toContain(`Detected root: ${targetDir}`);
    expect(result.stdout).toContain('Environment: REPO_ROOT=<path> sets the default checkout root');
  }, 30000);

  test('--version matches package.json', async () => {
    const result = await runCli(['--version'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(PACKAGE_JSON.version);
  });

  test('install snippets stay aligned with the published package name', () => {
    expect(PACKAGE_JSON.name).toBe('@mordonezdev/ldev');
    expect(README_TEXT).toContain(`npm install -g ${PACKAGE_JSON.name}`);
    expect(README_TEXT).toContain(`npx ${PACKAGE_JSON.name} --help`);
    expect(INSTALL_DOC_TEXT).toContain(`npm install -g ${PACKAGE_JSON.name}`);
    expect(INSTALL_DOC_TEXT).toContain(`ldev --help`);
  });

  test.each([
    'project',
    'db',
    'deploy',
    'env',
    'worktree',
    'osgi',
    'oauth',
    'mcp',
    'portal',
    'resource',
    'liferay',
    'doctor',
    'context',
  ])(
    '%s --help works',
    async (namespace) => {
      const result = await runCli([namespace, '--help'], {cwd: CLI_CWD});
      expect(result.exitCode).toBe(0);
      // liferay is a deprecated alias for portal — help output shows the canonical name
      const expectedName = namespace === 'liferay' ? 'portal' : namespace;
      expect(result.stdout).toContain(expectedName);
    },
    30000,
  );

  test('db --help documents destructive force import', async () => {
    const result = await runCli(['db', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('import --force / sync --force');
  }, 10000);

  test('project --help documents explicit commit opt-in', async () => {
    const result = await runCli(['project', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('By default this command never creates a git commit.');
    expect(result.stdout).toContain('--commit');
  }, 10000);

  test('project init --help shows the required bootstrap invocation', async () => {
    const result = await runCli(['project', 'init', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Required arguments:');
    expect(result.stdout).toContain('--name');
    expect(result.stdout).toContain('--dir');
    expect(result.stdout).toContain('ldev project init --name my-project --dir ~/projects/my-project');
  }, 10000);

  test('resource --help documents the normalized resource contract', async () => {
    const result = await runCli(['resource', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Read:');
    expect(result.stdout).toContain('Export:');
    expect(result.stdout).toContain('Import:');
    expect(result.stdout).toContain('adt');
    expect(result.stdout).toContain('export-structures');
    expect(result.stdout).toContain('export-templates');
    expect(result.stdout).toContain('import-fragments');
    expect(result.stdout).toContain('import-structures');
    expect(result.stdout).toContain('migration-init');
    expect(result.stdout).not.toContain('Legacy aliases');
    expect(result.stdout).not.toContain('get-structure');
  }, 10000);

  test('portal inventory --help documents the discovery commands', async () => {
    const result = await runCli(['portal', 'inventory', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Discovery commands');
    expect(result.stdout).toContain('sites');
    expect(result.stdout).toContain('pages');
    expect(result.stdout).toContain('page');
    expect(result.stdout).toContain('structures');
    expect(result.stdout).toContain('templates');
  }, 10000);

  test('portal --help reflects the final public contract', async () => {
    const result = await runCli(['portal', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Recommended starting points:');
    expect(result.stdout).toContain('Connectivity and API access checks');
    expect(result.stdout).toContain('Main discovery workflow for agents and humans');
    expect(result.stdout).toContain('Discovery examples:');
    expect(result.stdout).toContain('ldev portal inventory sites --json');
    expect(result.stdout).toContain('ldev portal inventory page --url /web/guest/home --json');
    expect(result.stdout).toContain('Connectivity and auth:');
    expect(result.stdout).toContain('Discovery:');
    expect(result.stdout).toContain('Portal diagnostics:');
    expect(result.stdout).toContain('check');
    expect(result.stdout).toContain('auth');
    expect(result.stdout).toContain('config');
    expect(result.stdout).toContain('inventory');
    expect(result.stdout).toContain('reindex');
    expect(result.stdout).toContain('page-layout');
    expect(result.stdout).toContain('search');
    expect(result.stdout).toContain('audit');
    expect(result.stdout).toContain('theme-check');
  }, 10000);

  test('worktree setup help documents automatic main handoff flags', async () => {
    const result = await runCli(['worktree', 'setup', '--help'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--stop-main-for-clone');
    expect(result.stdout).toContain('--restart-main-after-clone');
  }, 10000);

  test('mcp --help documents the MCP diagnostic flow', async () => {
    const result = await runCli(['mcp', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('check');
    expect(result.stdout).toContain('probe');
    expect(result.stdout).toContain('openapis');
    expect(result.stdout).toContain('--authorization-header');
  }, 10000);

  test('liferay alias routes to portal (backward compat)', async () => {
    const result = await runCli(['liferay', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('portal');
    expect(result.stdout).toContain('auth');
    expect(result.stdout).toContain('inventory');
  }, 10000);

  test('env --help lists only advanced operations, not daily lifecycle commands', async () => {
    const result = await runCli(['env', '--help'], {cwd: CLI_CWD});
    expect(result.exitCode).toBe(0);
    // Daily lifecycle commands must NOT appear as subcommands
    expect(result.stdout).not.toMatch(/^\s+start[\s[]/m);
    expect(result.stdout).not.toMatch(/^\s+stop[\s[]/m);
    expect(result.stdout).not.toMatch(/^\s+shell[\s[]/m);
    expect(result.stdout).not.toMatch(/^\s+setup[\s[]/m);
    expect(result.stdout).not.toMatch(/^\s+status[\s[]/m);
    // Advanced operations MUST be present
    expect(result.stdout).toContain('restart');
    expect(result.stdout).toContain('clean');
    expect(result.stdout).toContain('restore');
    expect(result.stdout).toContain('is-healthy');
  }, 10000);

  test('specialized namespaces are labeled clearly in help output', async () => {
    const resource = await runCli(['resource', '--help'], {cwd: CLI_CWD});
    const db = await runCli(['db', '--help'], {cwd: CLI_CWD});
    const worktree = await runCli(['worktree', '--help'], {cwd: CLI_CWD});
    const osgi = await runCli(['osgi', '--help'], {cwd: CLI_CWD});

    expect(resource.exitCode).toBe(0);
    expect(db.exitCode).toBe(0);
    expect(worktree.exitCode).toBe(0);
    expect(osgi.exitCode).toBe(0);

    expect(resource.stdout).toContain('specialized content workflows');
    expect(db.stdout).toContain('data migration, recovery and larger environment-management workflows');
    expect(worktree.stdout).toContain('specialized tooling for teams or contributors');
    expect(osgi.stdout).toContain('troubleshooting and runtime inspection');
  }, 30000);
});
