import {describe, expect, test} from 'vitest';

import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';

type DoctorPayload = {
  ok: boolean;
  summary: Record<string, unknown>;
  checks: unknown[];
  environment: Record<string, unknown>;
  config: Record<string, unknown>;
  ai: Record<string, unknown>;
  tools: Record<string, unknown>;
  capabilities: Record<string, unknown>;
};

describe('doctor integration', () => {
  test('doctor --format json prints valid json', async () => {
    const result = await runCli(['doctor', '--format', 'json'], {
      cwd: CLI_CWD,
    });

    expect([0, 1]).toContain(result.exitCode);
    const parsed = parseTestJson<DoctorPayload>(result.stdout);
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.summary).toHaveProperty('passed');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.environment).toHaveProperty('repoRoot');
    expect(parsed.environment).toHaveProperty('portalUrl');
    expect(parsed.environment).toHaveProperty('activationKeyFile');
    expect(parsed.config).toHaveProperty('sources');
    expect(parsed.ai).toHaveProperty('manifestPresent');
    expect(parsed.tools).toHaveProperty('git');
    expect(parsed.tools).toHaveProperty('dockerDaemon');
    expect(parsed.tools).toHaveProperty('playwrightCli');
    expect(parsed.capabilities).toBeTypeOf('object');
  }, 30000);
});
