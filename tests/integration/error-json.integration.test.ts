import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_DIR = process.cwd();

describe('error json integration', () => {
  test('commands emit stable json errors when requested', async () => {
    const invalidCwd = createTempDir('dev-cli-error-json-');
    const result = await runProcess('npx', ['tsx', `${CLI_DIR}/src/index.ts`, 'env', 'status', '--format', 'json'], {
      cwd: invalidCwd,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');

    const parsed = JSON.parse(result.stderr);
    expect(parsed).toEqual({
      ok: false,
      error: {
        code: 'ENV_REPO_NOT_FOUND',
        message: 'No se ha detectado un proyecto válido con docker/ y liferay/.',
      },
    });
  }, 15000);
});
