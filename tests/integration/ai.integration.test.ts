import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createTempDir, createTempRepo, createTempWorkspace} from '../../src/testing/temp-repo.js';
import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';

const AI_ROOT = path.resolve(CLI_CWD, 'templates', 'ai');
const PACKAGE_VERSION = (fs.readJsonSync(path.join(CLI_CWD, 'package.json')) as {version: string}).version;

describe('ai integration', () => {
  test('install creates vendor skills, manifest, AGENTS.md and common managed AI rules', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-');

    const result = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', '.vendor-skills'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.ldev', 'ai', 'rules-manifest.json'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.github', 'copilot-instructions.md'))).toBe(true);

    const installedSkills = (await fs.readdir(path.join(targetDir, '.agents', 'skills'))).sort();
    const vendorSkills = (await fs.readFile(path.join(AI_ROOT, 'install', 'vendor-skills.txt'), 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'))
      .sort();

    expect(installedSkills).toEqual(vendorSkills);
    expect(installedSkills).not.toContain('issue-engineering');

    const manifest = await fs.readFile(path.join(targetDir, '.agents', '.vendor-skills'), 'utf8');
    expect(manifest).toContain('# Skills installed by ldev');
    expect(manifest).toContain('# Do not edit manually');
    expect(manifest).toContain(vendorSkills[0]);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-agent-workflow.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-liferay-core.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-liferay-client-extensions.md'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-liferay-mcp.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-workspace-setup.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-native-runtime.md'))).toBe(false);

    const rulesManifest = await fs.readJson(path.join(targetDir, '.ldev', 'ai', 'rules-manifest.json'));
    expect(rulesManifest.projectType).toBe('unknown');
    expect(rulesManifest.packageVersion).toBe(PACKAGE_VERSION);
    expect(rulesManifest.rules).toHaveLength(8);
    expect(rulesManifest.rules.map((rule: {id: string}) => rule.id).sort()).toEqual([
      'ldev-agent-workflow',
      'ldev-deploy-verification',
      'ldev-liferay-client-extensions',
      'ldev-liferay-core',
      'ldev-liferay-mcp',
      'ldev-portal-discovery',
      'ldev-resource-migrations',
      'ldev-runtime-troubleshooting',
    ]);
    for (const rule of rulesManifest.rules as Array<{namespace: string}>) {
      expect(rule.namespace).toBe('ldev');
    }
    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Read order:');
    expect(agents).toContain('docs/ai/project-context.md');
    expect(agents).not.toContain('{{LIFECYCLE_SKILLS_SECTION}}');
    const claude = await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8');
    expect(claude).toContain('if it exists');
  }, 30000);

  test('install --local adds agent/editor tooling paths to .gitignore but keeps docs/ai versionable', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-local-');

    const result = await runCli(['ai', 'install', '--target', targetDir, '--local', '--project-context'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);

    const gitignore = await fs.readFile(path.join(targetDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# ldev ai install --local');
    expect(gitignore).toContain('AGENTS.md');
    expect(gitignore).toContain('CLAUDE.md');
    expect(gitignore).toContain('.agents/');
    expect(gitignore).toContain('.claude/');
    expect(gitignore).toContain('.github/instructions/');
    expect(gitignore).toContain('.ldev/ai/');
    expect(gitignore).toContain('.liferay-cli.yml');
    expect(gitignore).not.toContain('docs/ai/project-context.md');
    expect(gitignore).not.toContain('docs/ai/project-context.md.sample');

    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'))).toBe(true);

    const secondResult = await runCli(['ai', 'install', '--target', targetDir, '--local'], {
      cwd: CLI_CWD,
    });
    expect(secondResult.exitCode).toBe(0);
    const secondGitignore = await fs.readFile(path.join(targetDir, '.gitignore'), 'utf8');
    expect(secondGitignore.match(/# ldev ai install --local/g)?.length).toBe(1);
  }, 30000);

  test('install --local adds marker when equivalent gitignore entries already exist', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-local-marker-');

    await fs.writeFile(
      path.join(targetDir, '.gitignore'),
      ['/AGENTS.md', 'CLAUDE.md # local tool file', '.agents/', '.claude/   ', ''].join('\n'),
    );

    const result = await runCli(['ai', 'install', '--target', targetDir, '--local'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);

    const gitignore = await fs.readFile(path.join(targetDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# ldev ai install --local');
    expect(gitignore.match(/# ldev ai install --local/g)?.length).toBe(1);
    expect(gitignore.match(/^AGENTS\.md$/gm)?.length ?? 0).toBe(0);
    expect(gitignore.match(/^CLAUDE\.md$/gm)?.length ?? 0).toBe(0);
    expect(gitignore.endsWith('\n')).toBe(true);
    expect(gitignore.endsWith('\n\n')).toBe(false);
  }, 30000);

  test('install --local does not duplicate equivalent gitignore entries', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-local-normalize-');

    await fs.writeFile(
      path.join(targetDir, '.gitignore'),
      [
        '# existing ignore rules',
        '/AGENTS.md',
        'CLAUDE.md # managed locally',
        '/.agents/',
        '.claude/   ',
        '/.cursor/',
        '.gemini/ # optional',
        '/.windsurf/',
        '.workspace-rules/',
        '/.github/instructions/',
        '.github/copilot-instructions.md # keep local',
        '/.ldev/ai/',
        '.liferay-cli.yml',
        '',
      ].join('\n'),
    );

    const result = await runCli(['ai', 'install', '--target', targetDir, '--local'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);

    const gitignore = await fs.readFile(path.join(targetDir, '.gitignore'), 'utf8');
    expect(gitignore).toContain('# ldev ai install --local');
    expect(gitignore.match(/# ldev ai install --local/g)?.length).toBe(1);
    expect(gitignore).not.toContain('\nAGENTS.md\n');
    expect(gitignore).not.toContain('\nCLAUDE.md\n');
    expect(gitignore).not.toContain('\n.agents/\n');
    expect(gitignore).not.toContain('\n.claude/\n');
    expect(gitignore).not.toContain('\n.cursor/\n');
    expect(gitignore).not.toContain('\n.gemini/\n');
    expect(gitignore).not.toContain('\n.windsurf/\n');
    expect(gitignore.match(/^\.workspace-rules\/$/gm)?.length ?? 0).toBe(1);
    expect(gitignore).not.toContain('\n.github/instructions/\n');
    expect(gitignore).not.toContain('\n.github/copilot-instructions.md\n');
    expect(gitignore).not.toContain('\n.ldev/ai/\n');
    expect(gitignore.match(/^\.liferay-cli\.yml$/gm)?.length ?? 0).toBe(1);
    expect(gitignore.trimEnd().endsWith('# ldev ai install --local')).toBe(true);
  }, 30000);

  test('install --skill installs only selected vendor skills and writes manifest accordingly', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-selected-');

    const result = await runCli(
      ['ai', 'install', '--target', targetDir, '--skill', 'developing-liferay', '--skill', 'liferay-expert'],
      {
        cwd: CLI_CWD,
      },
    );

    expect(result.exitCode).toBe(0);

    const installedSkills = (await fs.readdir(path.join(targetDir, '.agents', 'skills'))).sort();
    expect(installedSkills).toEqual(['developing-liferay', 'liferay-expert']);

    const manifest = await fs.readFile(path.join(targetDir, '.agents', '.vendor-skills'), 'utf8');
    expect(manifest).toContain('developing-liferay');
    expect(manifest).toContain('liferay-expert');
    expect(manifest).not.toContain('deploying-liferay');
  }, 30000);

  test('update preserves local skills and an existing AGENTS.md', async () => {
    const targetDir = createTempDir('dev-cli-ai-update-');
    const installResult = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    await fs.ensureDir(path.join(targetDir, '.agents', 'skills', 'custom-project-skill'));
    await fs.writeFile(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'), '# custom\n');
    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'local agents\n');

    const updateResult = await runCli(['ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'))).toBe(
      true,
    );
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('local agents\n');
  }, 30000);

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

    const updateResult = await runCli(['ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'retired-vendor-skill'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'developing-liferay', 'SKILL.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'custom-project-skill', 'SKILL.md'))).toBe(
      true,
    );
  }, 30000);

  test('update --skill rewrites vendor manifest scope and removes previously managed vendor skills', async () => {
    const targetDir = createTempDir('dev-cli-ai-update-selected-');

    const installResult = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(installResult.exitCode).toBe(0);

    const updateResult = await runCli(['ai', 'update', '--target', targetDir, '--skill', 'liferay-expert'], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    const installedSkills = await fs.readdir(path.join(targetDir, '.agents', 'skills'));
    expect(installedSkills).toEqual(['liferay-expert']);

    const manifest = await fs.readFile(path.join(targetDir, '.agents', '.vendor-skills'), 'utf8');
    expect(manifest).toContain('liferay-expert');
    expect(manifest).not.toContain('developing-liferay');
  }, 30000);

  test('install fails when --skill is unknown', async () => {
    const targetDir = createTempDir('dev-cli-ai-install-invalid-skill-');

    const result = await runCli(['ai', 'install', '--target', targetDir, '--skill', 'unknown-skill'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('Unknown vendor skill');
  }, 30000);

  test('install without force keeps AGENTS.md and install with force overwrites it', async () => {
    const targetDir = createTempDir('dev-cli-ai-force-');
    const firstInstall = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(firstInstall.exitCode).toBe(0);

    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'custom agents\n');

    const keepResult = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(keepResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('custom agents\n');

    const forceResult = await runCli(['ai', 'install', '--target', targetDir, '--force'], {
      cwd: CLI_CWD,
    });
    expect(forceResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toContain(`.agents/skills/project-*`);
  }, 30000);

  test('install --project in a generic repo installs only the capability-safe project-owned skill', async () => {
    const targetDir = createTempDir('My Project.ai.project-');

    const result = await runCli(['ai', 'install', '--target', targetDir, '--project'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'))).toBe(true);

    const projectSkills = ['capturing-session-knowledge'].map((skill) => `project-${skill}`);

    for (const skill of projectSkills) {
      expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', skill, 'SKILL.md'))).toBe(true);
    }
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-issue-engineering'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'issue-resolver.md'))).toBe(false);

    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('## Project-Owned Skills Installed By `--project`');
    expect(agents).toContain(`.agents/skills/project-*`);
    for (const skill of projectSkills) {
      expect(agents).toContain(`\`${skill}\``);
    }
  }, 30000);

  test('install --project in blade-workspace skips worktree-oriented project assets', async () => {
    const targetDir = createTempWorkspace();

    const result = await runCli(['ai', 'install', '--target', targetDir, '--project'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-capturing-session-knowledge'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-issue-engineering'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'issue-resolver.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'build-verifier.md'))).toBe(false);
  }, 30000);

  test('install --project in ldev-native installs the full project-owned issue workflow pack', async () => {
    const targetDir = createTempRepo();

    const result = await runCli(['ai', 'install', '--target', targetDir, '--project'], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-capturing-session-knowledge'))).toBe(
      true,
    );
    expect(await fs.pathExists(path.join(targetDir, '.agents', 'skills', 'project-issue-engineering'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'issue-resolver.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'agents', 'build-verifier.md'))).toBe(true);
  }, 30000);

  test('install --project-context creates CLAUDE.md, project-context docs and copilot-instructions.md but does not overwrite existing ones', async () => {
    const targetDir = createTempDir('dev-cli-ai-project-files-');

    const firstInstall = await runCli(['ai', 'install', '--target', targetDir, '--project-context'], {
      cwd: CLI_CWD,
    });
    expect(firstInstall.exitCode).toBe(0);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.github', 'copilot-instructions.md'))).toBe(true);

    await fs.writeFile(path.join(targetDir, 'CLAUDE.md'), 'custom claude\n');
    await fs.ensureDir(path.join(targetDir, 'docs', 'ai'));
    await fs.writeFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'custom context\n');
    await fs.writeFile(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'), 'custom sample\n');
    await fs.writeFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'custom copilot\n');

    const secondInstall = await runCli(['ai', 'install', '--target', targetDir, '--project-context'], {
      cwd: CLI_CWD,
    });
    expect(secondInstall.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'CLAUDE.md'), 'utf8')).toBe('custom claude\n');
    expect(await fs.readFile(path.join(targetDir, 'docs', 'ai', 'project-context.md'), 'utf8')).toBe(
      'custom context\n',
    );
    expect(await fs.readFile(path.join(targetDir, 'docs', 'ai', 'project-context.md.sample'), 'utf8')).toBe(
      'custom sample\n',
    );
    expect(await fs.readFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'utf8')).toBe(
      'custom copilot\n',
    );
  }, 40000);

  test('install in blade-workspace preserves official AI files and adds ldev workspace augmentation files', async () => {
    const targetDir = createTempWorkspace();

    await fs.ensureDir(path.join(targetDir, '.workspace-rules'));
    await fs.ensureDir(path.join(targetDir, '.claude'));
    await fs.ensureDir(path.join(targetDir, '.github'));
    await fs.writeFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'official workspace rules\n');
    await fs.writeFile(path.join(targetDir, '.claude', 'CLAUDE.md'), 'official claude\n');
    await fs.writeFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'official copilot\n');

    const result = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(result.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'utf8')).toBe(
      'official workspace rules\n',
    );
    expect(await fs.readFile(path.join(targetDir, '.claude', 'CLAUDE.md'), 'utf8')).toBe('official claude\n');
    expect(await fs.readFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'utf8')).toBe(
      'official copilot\n',
    );

    expect(await fs.pathExists(path.join(targetDir, 'AGENTS.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, 'CLAUDE.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, 'docs', 'ai', 'project-context.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.agents', '.vendor-skills'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-agent-workflow.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.claude', 'rules', 'ldev-agent-workflow.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.cursor', 'rules', 'ldev-agent-workflow.mdc'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.gemini', 'ldev-agent-workflow.md'))).toBe(true);
    expect(
      await fs.pathExists(path.join(targetDir, '.github', 'instructions', 'ldev-agent-workflow.instructions.md')),
    ).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.windsurf', 'rules', 'ldev-agent-workflow.md'))).toBe(true);

    const agents = await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8');
    expect(agents).toContain('Liferay Workspace');
    expect(agents).toContain('.workspace-rules/*.md');

    const rulesManifest = await fs.readJson(path.join(targetDir, '.ldev', 'ai', 'rules-manifest.json'));
    expect(rulesManifest.projectType).toBe('blade-workspace');
    expect(rulesManifest.packageVersion).toBe(PACKAGE_VERSION);
    expect(rulesManifest.officialWorkspaceFilesDetected).toEqual([
      '.workspace-rules/liferay-rules.md',
      '.claude/CLAUDE.md',
      '.github/copilot-instructions.md',
    ]);
    expect(rulesManifest.rules).toHaveLength(11);
    expect(rulesManifest.rules.map((rule: {id: string}) => rule.id).sort()).toEqual([
      'ldev-agent-workflow',
      'ldev-deploy-verification',
      'ldev-liferay-client-extensions',
      'ldev-liferay-core',
      'ldev-liferay-mcp',
      'ldev-portal-discovery',
      'ldev-resource-migrations',
      'ldev-runtime-troubleshooting',
      'ldev-workspace-deploy',
      'ldev-workspace-runtime',
      'ldev-workspace-setup',
    ]);
    for (const rule of rulesManifest.rules as Array<{
      id: string;
      namespace: string;
      targetFiles: string[];
      verifiedAgainst: string[];
      localModificationPolicy: string;
      sourceKind: string;
      sourceReferences?: string[];
    }>) {
      expect(['ldev', 'ldev-workspace']).toContain(rule.namespace);
      expect(rule.targetFiles).not.toContain('.workspace-rules/liferay-rules.md');
      expect(rule.verifiedAgainst).toEqual(['dxp-2026.q1.0-lts']);
      expect(rule.localModificationPolicy).toBe('replace-if-unmodified');
      if (rule.id.startsWith('ldev-liferay-') || rule.id.startsWith('ldev-workspace-')) {
        expect(rule.sourceKind).toBe('derived');
        expect(rule.sourceReferences?.length ?? 0).toBeGreaterThan(0);
      }
    }
  }, 40000);

  test('install in ldev-native adds common and native-specific rules but not workspace-specific rules', async () => {
    const targetDir = createTempDir('dev-cli-ai-native-rules-');
    await fs.ensureDir(path.join(targetDir, 'docker'));
    await fs.ensureDir(path.join(targetDir, 'liferay'));
    await fs.writeFile(path.join(targetDir, 'docker', 'docker-compose.yml'), 'services:\n');

    const result = await runCli(['ai', 'install', '--target', targetDir], {
      cwd: CLI_CWD,
    });
    expect(result.exitCode).toBe(0);

    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-liferay-core.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-native-runtime.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-native-deploy.md'))).toBe(true);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-workspace-setup.md'))).toBe(false);
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-workspace-runtime.md'))).toBe(false);

    const rulesManifest = await fs.readJson(path.join(targetDir, '.ldev', 'ai', 'rules-manifest.json'));
    expect(rulesManifest.projectType).toBe('ldev-native');
    expect(rulesManifest.packageVersion).toBe(PACKAGE_VERSION);
    expect(rulesManifest.rules).toHaveLength(10);
    expect(rulesManifest.rules.map((rule: {id: string}) => rule.id).sort()).toEqual([
      'ldev-agent-workflow',
      'ldev-deploy-verification',
      'ldev-liferay-client-extensions',
      'ldev-liferay-core',
      'ldev-liferay-mcp',
      'ldev-native-deploy',
      'ldev-native-runtime',
      'ldev-portal-discovery',
      'ldev-resource-migrations',
      'ldev-runtime-troubleshooting',
    ]);
  }, 40000);

  test('update in blade-workspace refreshes ldev-managed rule files without touching official workspace files', async () => {
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

    await fs.writeFile(path.join(targetDir, 'AGENTS.md'), 'custom workspace agents\n');

    const updateResult = await runCli(['ai', 'update', '--target', targetDir], {
      cwd: CLI_CWD,
    });

    expect(updateResult.exitCode).toBe(0);
    expect(await fs.readFile(path.join(targetDir, 'AGENTS.md'), 'utf8')).toBe('custom workspace agents\n');
    expect(await fs.readFile(path.join(targetDir, '.workspace-rules', 'liferay-rules.md'), 'utf8')).toBe(
      'official workspace rules\n',
    );
    expect(await fs.readFile(path.join(targetDir, '.claude', 'CLAUDE.md'), 'utf8')).toBe('official claude\n');
    expect(await fs.readFile(path.join(targetDir, '.github', 'copilot-instructions.md'), 'utf8')).toBe(
      'official copilot\n',
    );
    expect(await fs.pathExists(path.join(targetDir, '.workspace-rules', 'ldev-runtime-troubleshooting.md'))).toBe(true);
  }, 40000);
});
