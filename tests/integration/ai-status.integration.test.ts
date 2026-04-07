import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createTempDir, createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';
import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';

describe('ai status integration', () => {
  test('ai status reports missing manifest on a fresh generic repo', async () => {
    const targetDir = createTempDir('dev-cli-ai-status-empty-');

    const result = await runCli(['ai', 'status', '--target', targetDir, '--json'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.manifestPresent).toBe(false);
    expect(parsed.summary.managedRules).toBe(0);
  }, 30000);

  test('ai status reports managed workspace rules and detected official files', async () => {
    const targetDir = createTempWorkspace();

    await fs.ensureDir(path.join(targetDir, '.workspace-rules'));
    await fs.ensureDir(path.join(targetDir, '.claude'));
    await fs.ensureDir(path.join(targetDir, '.github'));
    await fs.writeFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'official workspace rules\n');
    await fs.writeFile(path.join(targetDir, '.claude', 'CLAUDE.md'), 'official claude\n');
    await fs.writeFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'official copilot\n');

    const installResult = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    const statusResult = await runCli(['ai', 'status', '--target', targetDir, '--json'], {
      cwd: CLI_CWD,
    });
    expect(statusResult.exitCode).toBe(0);

    const parsed = JSON.parse(statusResult.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.projectType).toBe('blade-workspace');
    expect(parsed.manifestPresent).toBe(true);
    expect(parsed.summary.managedRules).toBe(11);
    expect(parsed.summary.current).toBe(11);
    expect(parsed.officialWorkspaceFilesDetected).toEqual([
      '.workspace-rules/liferay-rules.md',
      '.claude/CLAUDE.md',
      '.github/copilot-instructions.md',
    ]);
    expect(parsed.coexistenceNotes.length).toBeGreaterThan(0);
    expect(parsed.warnings.some((warning: string) => warning.includes('Workspace AI files were detected'))).toBe(true);
  }, 40000);

  test('ai status reports common and native-specific managed rules in ldev-native', async () => {
    const targetDir = createTempRepo();

    const installResult = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    const statusResult = await runCli(['ai', 'status', '--target', targetDir, '--json'], {
      cwd: CLI_CWD,
    });
    expect(statusResult.exitCode).toBe(0);

    const parsed = JSON.parse(statusResult.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.projectType).toBe('ldev-native');
    expect(parsed.manifestPresent).toBe(true);
    expect(parsed.summary.managedRules).toBe(10);
    expect(parsed.summary.current).toBe(10);
    expect(parsed.officialWorkspaceFilesDetected).toEqual([]);
    expect(parsed.coexistenceNotes).toEqual([]);
  }, 40000);
});
