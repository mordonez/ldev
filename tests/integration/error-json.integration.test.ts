import {describe, expect, test} from 'vitest';

import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

type ErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
  };
};

describe('error json integration', () => {
  test('commands emit stable json errors when requested', async () => {
    const invalidCwd = createTempDir('dev-cli-error-json-');
    const result = await runCli(['status', '--format', 'json'], {
      cwd: invalidCwd,
    });

    expect(result.exitCode).toBe(1);
    const payload = result.stderr.trim() !== '' ? result.stderr : result.stdout;
    const parsed = parseTestJson<ErrorPayload>(payload);
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'RUNTIME_PROJECT_NOT_FOUND',
        message: 'No supported runtime project was detected.',
      },
    });
  }, 30000);

  test('usage errors use the json error envelope when json output is requested', async () => {
    const result = await runCli(['context', '--bogus', '--json'], {cwd: createTempDir('dev-cli-usage-json-')});

    expect(result.exitCode).toBe(2);
    expect(parseTestJson<ErrorPayload>(result.stderr)).toEqual({
      ok: false,
      error: {code: 'CLI_USAGE_ERROR', message: "unknown option '--bogus'"},
    });
  }, 30000);
});
