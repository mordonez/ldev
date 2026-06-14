import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {
  isProbablyBinary,
  normalizeGitignoreEntryForComparison,
  normalizeTextLineEndings,
  ensureLocalAiGitignoreEntries,
  writeTextFileLf,
} from '../../src/features/ai/ai-install-fs.js';
import {buildNextSteps} from '../../src/features/ai/ai-install-project.js';

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

describe('buildNextSteps', () => {
  test('returns steps for blade-workspace', () => {
    const steps = buildNextSteps('blade-workspace');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps.some((s) => s.includes('Liferay Workspace'))).toBe(true);
  });

  test('returns steps for unknown project type', () => {
    const steps = buildNextSteps('unknown');
    expect(steps.length).toBeGreaterThan(0);
    expect(steps[0]).toContain('AGENTS.md');
  });

  test('includes skills install step', () => {
    const steps = buildNextSteps('unknown');
    expect(steps.some((s) => s.includes('npx skills add'))).toBe(true);
  });

  test('includes bootstrap verification step', () => {
    const steps = buildNextSteps('blade-workspace');
    expect(steps.some((s) => s.includes('ldev ai bootstrap'))).toBe(true);
  });
});
