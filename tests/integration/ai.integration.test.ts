import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createTempDir, createTempWorkspace} from '../../src/testing/temp-repo.js';
import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';

describe('ai integration', () => {
  test('install creates AGENTS.md and common AI files', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.github', 'copilot-instructions.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.gemini', 'GEMINI.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.cursorrules'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'))).toBe(true);
    expect(
      await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-issue-engineering', 'SKILL.md')),
    ).toBe(true);

    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).not.toContain('{{LIFECYCLE_SKILLS_SECTION}}');
    expect(agents).toContain('docs/ai/project-context.md');

    expect(result.stdout).toContain('AGENTS.md: installed');
    expect(result.stdout).toContain('CLAUDE.md: applied');
    expect(result.stdout).toContain('.agents/skills/project-issue-engineering: applied');
  }, 30000);

  test('output includes next steps with npx skills add', async () => {
    const targetDir = createTempDir('dev-cli-ai-nextsteps-');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Next steps:');
    expect(result.stdout).toContain('npx skills add https://github.com/mordonez/ldev');
    expect(result.stdout).toContain('ldev ai bootstrap --intent=develop --json');
  }, 30000);

  test('install without --force keeps existing AGENTS.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-keep-');

    await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'custom agents\n');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('custom agents\n');
    expect(result.stdout).toContain('AGENTS.md: kept');
  }, 30000);

  test('install with --force overwrites existing AGENTS.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-force-agents-');

    await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'custom agents\n');

    const result = await runCli(['ai', 'install', '--target', targetDir, '--force'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).not.toBe('custom agents\n');
    expect(agents).toContain('docs/ai/project-context.md');
    expect(result.stdout).toContain('AGENTS.md: overwritten');
  }, 30000);

  test('install without --force does not overwrite existing project files', async () => {
    const targetDir = createTempDir('dev-cli-ai-noforce-files-');

    await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'custom claude\n');
    await fs.writeFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'custom context\n');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe('custom claude\n');
    expect(await fs.readFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'utf8')).toBe(
      'custom context\n',
    );
  }, 30000);

  test('install with --force overwrites existing project files', async () => {
    const targetDir = createTempDir('dev-cli-ai-force-files-');

    await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'custom claude\n');
    await fs.writeFile(path.join(targetDir, '.cursorrules'), 'custom cursor\n');
    await fs.writeFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'custom context\n');

    const result = await runCli(['ai', 'install', '--target', targetDir, '--force'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8')).not.toBe('custom claude\n');
    expect(await fs.readFile(path.join(targetDir, '.cursorrules'), 'utf8')).not.toBe('custom cursor\n');
    expect(await fs.readFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'utf8')).not.toBe(
      'custom context\n',
    );
  }, 30000);

  test('installed files use LF line endings', async () => {
    const targetDir = createTempDir('dev-cli-ai-lf-');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);

    const managedFiles = await collectFiles([
      path.join(targetDir, 'AGENTS.md'),
      path.join(targetDir, 'CLAUDE.md'),
      path.join(targetDir, '.gemini'),
      path.join(targetDir, '.cursorrules'),
      path.join(targetDir, 'docs', 'ai'),
    ]);

    expect(managedFiles.length).toBeGreaterThan(0);
    for (const file of managedFiles) {
      const content = await fs.readFile(file);
      expect(content.includes(Buffer.from('\r\n')), file).toBe(false);
    }
  }, 30000);

  test('install in blade-workspace skips CLAUDE.md and copilot-instructions', async () => {
    const targetDir = createTempWorkspace();

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(false);
    expect(result.stdout).toContain('Project type: blade-workspace');

    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Liferay Workspace');
  }, 30000);

  test('install in blade-workspace preserves existing official files', async () => {
    const targetDir = createTempWorkspace();

    await fs.ensureDir(path.join(targetDir, '.workspace-rules'));
    await fs.ensureDir(path.join(targetDir, '.github'));
    await fs.writeFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'official workspace rules\n');
    await fs.writeFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'official copilot\n');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'utf8')).toBe(
      'official workspace rules\n',
    );
    expect(await fs.readFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'utf8')).toBe(
      'official copilot\n',
    );
  }, 30000);

  test('install reports project type in output', async () => {
    const targetDir = createTempDir('dev-cli-ai-projecttype-');

    const result = await runCli(['ai', 'install', '--target', targetDir], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Project type:');
    expect(result.stdout).toContain('Installation completed in:');
  }, 30000);
});

async function collectFiles(pathsToCollect: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const pathToCollect of pathsToCollect) {
    if (!(await fs.pathExists(pathToCollect))) {
      continue;
    }

    const stat = await fs.stat(pathToCollect);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(pathToCollect);
      files.push(...(await collectFiles(entries.map((entry) => path.join(pathToCollect, entry)))));
    } else {
      files.push(pathToCollect);
    }
  }

  return files;
}
