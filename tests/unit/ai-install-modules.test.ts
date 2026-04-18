import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {buildRulesManifest} from '../../src/features/ai/ai-install-rules.js';
import {
  isProbablyBinary,
  normalizeGitignoreEntryForComparison,
  normalizeTextLineEndings,
  ensureLocalAiGitignoreEntries,
  writeTextFileLf,
} from '../../src/features/ai/ai-install-fs.js';
import {
  normalizeRelativePath,
  uniqueSorted,
  resolveSelectedSkills,
  buildNextSteps,
  buildProjectOverlayWarnings,
  buildWorkspaceCoexistenceWarnings,
} from '../../src/features/ai/ai-install-project.js';

// ---------------------------------------------------------------------------
// ai-install-fs — pure helpers
// ---------------------------------------------------------------------------

describe('normalizeTextLineEndings', () => {
  test('converts CRLF to LF', () => {
    expect(normalizeTextLineEndings('foo\r\nbar\r\nbaz')).toBe('foo\nbar\nbaz');
  });

  test('converts CR-only to LF', () => {
    expect(normalizeTextLineEndings('foo\rbar')).toBe('foo\nbar');
  });

  test('leaves LF-only content unchanged', () => {
    expect(normalizeTextLineEndings('foo\nbar\n')).toBe('foo\nbar\n');
  });

  test('handles empty string', () => {
    expect(normalizeTextLineEndings('')).toBe('');
  });
});

describe('isProbablyBinary', () => {
  test('returns true when buffer contains a null byte', () => {
    const buf = Buffer.from([0x66, 0x6f, 0x00, 0x62]);
    expect(isProbablyBinary(buf)).toBe(true);
  });

  test('returns false for a plain text buffer with no null bytes', () => {
    const buf = Buffer.from('hello world', 'utf8');
    expect(isProbablyBinary(buf)).toBe(false);
  });

  test('returns false for an empty buffer', () => {
    expect(isProbablyBinary(Buffer.alloc(0))).toBe(false);
  });
});

describe('normalizeGitignoreEntryForComparison', () => {
  test('strips leading slashes', () => {
    expect(normalizeGitignoreEntryForComparison('/node_modules')).toBe('node_modules');
    expect(normalizeGitignoreEntryForComparison('//dist')).toBe('dist');
  });

  test('strips inline comments', () => {
    expect(normalizeGitignoreEntryForComparison('dist/ # build output')).toBe('dist/');
  });

  test('returns empty string for comment-only lines', () => {
    expect(normalizeGitignoreEntryForComparison('# this is a comment')).toBe('');
  });

  test('returns empty string for blank lines', () => {
    expect(normalizeGitignoreEntryForComparison('')).toBe('');
    expect(normalizeGitignoreEntryForComparison('   ')).toBe('');
  });

  test('trims surrounding whitespace', () => {
    expect(normalizeGitignoreEntryForComparison('  .env  ')).toBe('.env');
  });
});

// ---------------------------------------------------------------------------
// ai-install-fs — ensureLocalAiGitignoreEntries (filesystem)
// ---------------------------------------------------------------------------

describe('ensureLocalAiGitignoreEntries', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('creates .gitignore with expected entries when it does not exist', async () => {
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added.length).toBeGreaterThan(0);
    expect(added).toContain('AGENTS.md');
    const content = await fs.readFile(path.join(tmpDir, '.gitignore'), 'utf8');
    expect(content).toContain('# ldev ai install --local');
    expect(content).toContain('AGENTS.md');
  });

  test('does not duplicate entries when called twice', async () => {
    await ensureLocalAiGitignoreEntries(tmpDir);
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added).toHaveLength(0);
  });

  test('appends entries to an existing .gitignore', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.writeFile(gitignorePath, 'node_modules/\n');
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    const content = await fs.readFile(gitignorePath, 'utf8');
    expect(content).toContain('node_modules/');
    expect(content).toContain('AGENTS.md');
    expect(added).toContain('AGENTS.md');
  });

  test('skips entries already present in the .gitignore', async () => {
    const gitignorePath = path.join(tmpDir, '.gitignore');
    await fs.writeFile(gitignorePath, 'AGENTS.md\n');
    const added = await ensureLocalAiGitignoreEntries(tmpDir);

    expect(added).not.toContain('AGENTS.md');
  });
});

// ---------------------------------------------------------------------------
// ai-install-fs — writeTextFileLf
// ---------------------------------------------------------------------------

describe('writeTextFileLf', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ldev-test-'));
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('writes content with LF line endings', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    await writeTextFileLf(filePath, 'foo\r\nbar\r\nbaz');

    const content = await fs.readFile(filePath, 'utf8');
    expect(content).toBe('foo\nbar\nbaz');
    expect(content).not.toContain('\r');
  });
});

// ---------------------------------------------------------------------------
// ai-install-project — pure helpers
// ---------------------------------------------------------------------------

describe('normalizeRelativePath', () => {
  test('replaces backslashes with forward slashes', () => {
    expect(normalizeRelativePath('src\\features\\ai')).toBe('src/features/ai');
  });

  test('leaves forward-slash paths unchanged', () => {
    expect(normalizeRelativePath('src/features/ai')).toBe('src/features/ai');
  });

  test('handles empty string', () => {
    expect(normalizeRelativePath('')).toBe('');
  });
});

describe('uniqueSorted', () => {
  test('removes duplicates and sorts alphabetically', () => {
    expect(uniqueSorted(['b', 'a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  test('trims whitespace from values', () => {
    expect(uniqueSorted(['  foo  ', 'bar'])).toEqual(['bar', 'foo']);
  });

  test('filters out empty strings after trimming', () => {
    expect(uniqueSorted(['a', '', '  ', 'b'])).toEqual(['a', 'b']);
  });

  test('returns empty array for empty input', () => {
    expect(uniqueSorted([])).toEqual([]);
  });
});

describe('resolveSelectedSkills', () => {
  test('returns empty array when no skills are requested', () => {
    expect(resolveSelectedSkills(['commit', 'review-pr'], [])).toEqual([]);
  });

  test('returns requested skills when all are valid', () => {
    expect(resolveSelectedSkills(['commit', 'review-pr'], ['commit'])).toEqual(['commit']);
  });

  test('throws CliError when a requested skill does not exist', () => {
    expect(() => resolveSelectedSkills(['commit'], ['unknown-skill'])).toThrow();
  });

  test('throws CliError mentioning the invalid skill name', () => {
    expect(() => resolveSelectedSkills(['commit'], ['bad-skill'])).toThrowError(/bad-skill/);
  });
});

describe('buildNextSteps', () => {
  test('returns skillsOnly steps for blade-workspace', () => {
    const steps = buildNextSteps('/project', 'blade-workspace', false, true, false, false, []);
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toContain('.workspace-rules');
  });

  test('returns skillsOnly steps for unknown project type with selected skills', () => {
    const steps = buildNextSteps('/project', 'unknown', false, true, false, false, ['commit']);
    expect(steps[0]).toContain('.agents/skills');
  });

  test('includes local gitignore review step when local is true', () => {
    const steps = buildNextSteps('/project', 'unknown', true, false, false, false, []);
    expect(steps.some((s) => s.includes('.gitignore'))).toBe(true);
  });

  test('includes project note when project flag is true', () => {
    const steps = buildNextSteps('/project', 'blade-workspace', false, false, true, false, []);
    expect(steps.some((s) => s.includes('project-owned'))).toBe(true);
  });
});

describe('buildProjectOverlayWarnings', () => {
  test('returns no warnings when no project agents installed', () => {
    const warnings = buildProjectOverlayWarnings({
      projectType: 'blade-workspace',
      projectSkillsInstalled: [],
      projectAgentsInstalled: [],
    });
    expect(warnings).toHaveLength(0);
  });

  test('warns when project agents installed without issue-engineering skill', () => {
    const warnings = buildProjectOverlayWarnings({
      projectType: 'blade-workspace',
      projectSkillsInstalled: [],
      projectAgentsInstalled: ['my-agent'],
    });
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('issue-engineering');
  });

  test('no warning when project agents installed with issue-engineering skill', () => {
    const warnings = buildProjectOverlayWarnings({
      projectType: 'blade-workspace',
      projectSkillsInstalled: ['project-issue-engineering'],
      projectAgentsInstalled: ['my-agent'],
    });
    expect(warnings).toHaveLength(0);
  });
});

describe('buildWorkspaceCoexistenceWarnings', () => {
  test('returns no warnings for non-blade-workspace project type', () => {
    const warnings = buildWorkspaceCoexistenceWarnings('unknown', ['.workspace-rules/liferay-rules.md']);
    expect(warnings).toHaveLength(0);
  });

  test('returns no warnings for blade-workspace with no official files detected', () => {
    const warnings = buildWorkspaceCoexistenceWarnings('blade-workspace', []);
    expect(warnings).toHaveLength(0);
  });

  test('returns base warning for blade-workspace with official files', () => {
    const warnings = buildWorkspaceCoexistenceWarnings('blade-workspace', ['some-official-file.md']);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('base layer');
  });

  test('adds MCP conflict warning when liferay-rules.md is among detected files', () => {
    const warnings = buildWorkspaceCoexistenceWarnings('blade-workspace', ['.workspace-rules/liferay-rules.md']);
    expect(warnings.length).toBe(2);
    expect(warnings[1]).toContain('ldev-liferay-mcp');
  });
});

// ---------------------------------------------------------------------------
// ai-install-rules — buildRulesManifest (pure)
// ---------------------------------------------------------------------------

describe('buildRulesManifest', () => {
  test('returns a manifest with version 1 and correct metadata', () => {
    const now = new Date('2025-01-15T10:00:00Z');
    const manifest = buildRulesManifest({
      now,
      packageVersion: '0.4.0',
      targetDir: '/project',
      projectType: 'unknown',
      officialWorkspaceFilesDetected: [],
      rules: [],
    });

    expect(manifest.version).toBe(1);
    expect(manifest.packageVersion).toBe('0.4.0');
    expect(manifest.projectType).toBe('unknown');
    expect(manifest.generatedAt).toBe('2025-01-15T10:00:00.000Z');
  });

  test('stamps rules with lastVerifiedAt date slice', () => {
    const now = new Date('2025-01-15T10:00:00Z');
    const manifest = buildRulesManifest({
      now,
      packageVersion: '0.4.0',
      targetDir: '/project',
      projectType: 'unknown',
      officialWorkspaceFilesDetected: [],
      rules: [
        {
          id: 'ldev-liferay-core',
          namespace: 'ldev',
          layer: 'ldev-common',
          maintainer: 'ldev',
          sourceKind: 'derived',
          sourcePath: '.ldev/ai/rules/ldev-liferay-core.md',
          sourceReferences: [],
          targetFiles: [],
          contentHash: 'sha256:abc',
          verifiedAgainst: [],
          lastVerifiedAt: '',
          verificationStatus: 'verified',
          localModificationPolicy: 'replace-if-unmodified',
        },
      ],
    });

    expect(manifest.rules[0].lastVerifiedAt).toBe('2025-01-15');
  });

  test('includes officialWorkspaceFilesDetected in output', () => {
    const now = new Date();
    const manifest = buildRulesManifest({
      now,
      packageVersion: '0.4.0',
      targetDir: '/project',
      projectType: 'blade-workspace',
      officialWorkspaceFilesDetected: ['.workspace-rules/liferay-rules.md'],
      rules: [],
    });

    expect(manifest.officialWorkspaceFilesDetected).toEqual(['.workspace-rules/liferay-rules.md']);
  });
});
