import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = 'src/index.ts';
const AI_ROOT = path.resolve(CLI_CWD, 'tools', 'ai');
describe('ai integration', () => {
  test('install creates vendor skills, manifest and the standard AGENTS.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-');

    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', '.vendor-skills'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(false);

    const installedSkills = (await fs.readdir(path.join(targetDir, '.agents', 'skills'))).sort();
    const vendorSkills = (await fs.readFile(path.join(AI_ROOT, 'install', 'vendor-skills.txt'), 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .sort();

    expect(installedSkills).toEqual(vendorSkills);
    expect(installedSkills).not.toContain('issue-engineering');
    expect(installedSkills).not.toContain('automating-browser-tests');

    const manifest = await fs.readFile(path.join(targetDir, '.agents', '.vendor-skills'), 'utf8');
    expect(manifest).toContain('# Skills instaladas desde ldev');
    expect(manifest).toContain('# NO editar manualmente');
    expect(manifest).toContain(vendorSkills[0]);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe(
      await fs.readFile(path.join(AI_ROOT, 'install', 'AGENTS.md'), 'utf8'),
    );
  }, 15000);

  test('update preserves local skills and an existing AGENTS.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-update-');
    const installResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    await fs.ensureDir(path.join(targetDir, '.agents', 'skills', 'custom-project-skill'));
    await fs.writeFile(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'), '# custom\n');
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'local agents\n');

    const updateResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'))).toBe(
      true,
    );
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('local agents\n');
  }, 15000);

  test('update installs newly curated vendor skills and removes retired vendor-managed skills', async () => {
    const targetDir = createTempDir('dev-cli-ai-update-curated-');

    await fs.ensureDir(path.join(targetDir, '.agents', 'skills', 'retired-vendor-skill'));
    await fs.writeFile(path.join(targetDir, '.agents', 'skills', 'retired-vendor-skill', 'SKILL.md'), '# retired\n');
    await fs.ensureDir(path.join(targetDir, '.agents', 'skills', 'custom-project-skill'));
    await fs.writeFile(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'), '# custom\n');
    await fs.ensureDir(path.join(targetDir, '.agents'));
    await fs.writeFile(
      path.join(targetDir, '.agents', '.vendor-skills'),
      '# old vendor surface\nretired-vendor-skill\ndeploying-liferay\n',
    );

    const updateResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'retired-vendor-skill'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'developing-liferay', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'))).toBe(
      true,
    );
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

    const forceResult = await runProcess('npx', ['tsx', CLI_ENTRY, 'ai', 'install', '--target', targetDir, '--force'], {
      cwd: CLI_CWD,
    });
    expect(forceResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe(
      await fs.readFile(path.join(AI_ROOT, 'install', 'AGENTS.md'), 'utf8'),
    );
  }, 15000);

  test('legacy overlay installs cleanly on top of the standard package', async () => {
    const targetDir = createTempDir('dev-cli-ai-legacy-');

    const result = await runProcess('bash', ['tools/ai/legacy/install.sh', targetDir], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'agents', 'validate-all.sh'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'issue-resolver.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'issue-engineering', 'SKILL.md'))).toBe(true);

    const validation = await runProcess('bash', ['agents/validate-all.sh'], {
      cwd: targetDir,
    });

    expect(validation.exitCode).toBe(0);
  }, 20000);
});
