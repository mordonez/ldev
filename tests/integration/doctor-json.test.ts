import {describe, expect, test} from 'vitest';

import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';

type DoctorPayload = {
  ok: boolean;
  contractVersion: number;
  summary: Record<string, unknown>;
  checks: unknown[];
  stamp: Record<string, unknown>;
  readiness: Record<string, unknown>;
  tools: Record<string, unknown>;
  runtime: Record<string, unknown> | null;
  portal: Record<string, unknown> | null;
  osgi: Record<string, unknown> | null;
};

describe('doctor integration', () => {
  test('doctor --format json prints valid json', async () => {
    const result = await runCli(['doctor', '--format', 'json'], {
      cwd: CLI_CWD,
    });

    expect([0, 1]).toContain(result.exitCode);
    const parsed = parseTestJson<DoctorPayload>(result.stdout);
    expect(typeof parsed.ok).toBe('boolean');
    expect(parsed.contractVersion).toBe(2);
    expect(parsed.summary).toHaveProperty('passed');
    expect(parsed.summary).toHaveProperty('durationMs');
    expect(Array.isArray(parsed.checks)).toBe(true);
    expect(parsed.stamp).toHaveProperty('projectType');
    expect(parsed.stamp).toHaveProperty('portalUrl');
    expect(parsed).not.toHaveProperty('inventory');
    expect(parsed).not.toHaveProperty('config');
    expect(parsed).not.toHaveProperty('ai');
    expect(parsed.tools).toHaveProperty('git');
    expect(parsed.tools).toHaveProperty('dockerDaemon');
    expect(parsed.tools).toHaveProperty('playwrightCli');
    expect(parsed.readiness).toHaveProperty('start');
    expect(parsed.runtime).toBeNull();
    expect(parsed.portal).toBeNull();
    expect(parsed.osgi).toBeNull();
  }, 30000);

  test('doctor --runtime --format json populates the runtime block', async () => {
    const result = await runCli(['doctor', '--runtime', '--format', 'json'], {
      cwd: CLI_CWD,
    });

    expect([0, 1]).toContain(result.exitCode);
    const parsed = parseTestJson<DoctorPayload>(result.stdout);
    expect(parsed.runtime).not.toBeNull();
  }, 30000);
});
