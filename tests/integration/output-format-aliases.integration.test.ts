import {describe, expect, test} from 'vitest';

import {runCli, CLI_CWD} from '../../src/testing/cli-entry.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';

type ContextPayload = {
  ok: boolean;
  contractVersion: number;
};

describe('output format aliases integration', () => {
  test('--json is equivalent to --format json', async () => {
    const result = await runCli(['context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = parseTestJson<ContextPayload>(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe(2);
  }, 30000);

  test('--ndjson is equivalent to --format ndjson', async () => {
    const result = await runCli(['context', '--ndjson'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = parseTestJson<ContextPayload>(lines[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe(2);
  }, 30000);
});
