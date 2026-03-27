import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';

const CLI_CWD = process.cwd();

describe('doctor integration', () => {
  test('doctor --format json prints valid json', async () => {
    const result = await runProcess('npx', ['tsx', 'src/index.ts', 'doctor', '--format', 'json'], {
      cwd: CLI_CWD,
    });

    expect([0, 1]).toContain(result.exitCode);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.summary).toHaveProperty('passed');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.environment).toHaveProperty('repoRoot');
    expect(parsed.config).toHaveProperty('sources');
    expect(parsed.tools).toHaveProperty('git');
    expect(parsed.capabilities).toBeTypeOf('object');
  }, 15000);
});
