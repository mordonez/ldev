import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = 'src/index.ts';
const AI_ROOT = path.resolve(CLI_CWD, 'tools', 'ai');
const SKILLS_ROOT = path.join(AI_ROOT, 'skills');

describe('ai integration', () => {
  test('install creates vendor skills, manifest, AGENTS.md and CLAUDE.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-');

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', '.vendor-skills'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);

    const installedSkills = (await fs.readdir(path.join(targetDir, '.agents', 'skills'))).sort();
    const vendorSkills = (
      await fs.readdir(SKILLS_ROOT, {withFileTypes: true})
    )
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    expect(installedSkills).toEqual(vendorSkills);

    const manifest = await fs.readFile(path.join(targetDir, '.agents', '.vendor-skills'), 'utf8');
    expect(manifest).toContain('# Skills instaladas desde ldev');
    expect(manifest).toContain('# NO editar manualmente');
    expect(manifest).toContain(vendorSkills[0]);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe(
      await fs.readFile(path.join(AI_ROOT, 'AGENTS.md'), 'utf8'),
    );
    expect(await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe(
      await fs.readFile(path.join(AI_ROOT, 'CLAUDE.md.template'), 'utf8'),
    );
  }, 15000);

  test('update preserves local skills and existing AGENTS.md and CLAUDE.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-update-');
    const installResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    await fs.ensureDir(path.join(targetDir, '.agents', 'skills', 'custom-project-skill'));
    await fs.writeFile(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'), '# custom\n');
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'local agents\n');
    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'local claude\n');

    const updateResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'))).toBe(true);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('local agents\n');
    expect(await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe('local claude\n');
  }, 15000);

  test('install without force keeps AGENTS.md and install with force overwrites it', async () => {
    const targetDir = createTempDir('dev-cli-ai-force-');
    const firstInstall = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(firstInstall.exitCode).toBe(0);

    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'custom agents\n');

    const keepResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(keepResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('custom agents\n');

    const forceResult = await runProcess(
      'npx',
      ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir, '--force'],
      {cwd: CLI_CWD},
    );
    expect(forceResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe(
      await fs.readFile(path.join(AI_ROOT, 'AGENTS.md'), 'utf8'),
    );
  }, 15000);
});
