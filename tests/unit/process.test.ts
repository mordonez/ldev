import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';

describe('process', () => {
  test('captures stdout and exit code', async () => {
    const result = await runProcess(process.execPath, ['-e', 'console.log("ok")']);

    expect(result.ok).toBe(true);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('ok');
  });

  test('captures failing exit code', async () => {
    const result = await runProcess(process.execPath, ['-e', 'process.exit(7)']);

    expect(result.ok).toBe(false);
    expect(result.exitCode).toBe(7);
  });
});
