import {describe, expect, test} from 'vitest';

import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';

describe('agent contract integration', () => {
  test('context --json returns the resolved agent context', async () => {
    const result = await runCli(['context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe('1');
    expect(parsed.repo).toHaveProperty('root');
    expect(parsed.files).toHaveProperty('dockerDir');
    expect(parsed.env).toHaveProperty('portalUrl');
    expect(parsed.liferay).toHaveProperty('oauth2Configured');
    expect(parsed.ai).toHaveProperty('manifestPresent');
    expect(parsed.platform).toHaveProperty('supportsWorktrees');
  }, 30000);

  test('context --json includes the current command readiness matrix', async () => {
    const result = await runCli(['context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe('1');
    expect(parsed.commands).toHaveProperty('context');
    expect(parsed.commands).toHaveProperty('start');
    expect(parsed.commands).toHaveProperty('liferay');
  }, 30000);
});
