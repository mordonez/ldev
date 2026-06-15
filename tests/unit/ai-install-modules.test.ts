import os from 'node:os';
import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {isProbablyBinary, normalizeTextLineEndings, writeTextFileLf} from '../../src/features/ai/ai-install-fs.js';
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
// ai-install-project — buildNextSteps
// ---------------------------------------------------------------------------

describe('buildNextSteps', () => {
  test('includes npx skills add step for all project types', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.some((s) => s.includes('npx skills add'))).toBe(true);
  });

  test('includes bootstrap verification step', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.some((s) => s.includes('ldev ai bootstrap'))).toBe(true);
  });

  test('includes base layer note for blade-workspace', () => {
    const steps = buildNextSteps('blade-workspace');

    expect(steps.some((s) => s.includes('base layer'))).toBe(true);
  });

  test('does not include base layer note for ldev-native', () => {
    const steps = buildNextSteps('ldev-native');

    expect(steps.every((s) => !s.includes('base layer'))).toBe(true);
  });
});
