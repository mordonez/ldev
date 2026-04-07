import {describe, expect, test} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('error json integration', () => {
  test('commands emit stable json errors when requested', async () => {
    const invalidCwd = createTempDir('dev-cli-error-json-');
    const result = await runCli(['status', '--format', 'json'], {
      cwd: invalidCwd,
    });

    expect(result.exitCode).toBe(1);
    const payload = result.stderr.trim() !== '' ? result.stderr : result.stdout;
    const parsed = JSON.parse(payload);
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'RUNTIME_PROJECT_NOT_FOUND',
        message: 'No supported runtime project was detected.',
      },
    });
  }, 30000);
});
