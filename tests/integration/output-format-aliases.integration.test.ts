import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';

const CLI_CWD = process.cwd();
const CLI_ENTRY = 'src/index.ts';

describe('output format aliases integration', () => {
  test('--json is equivalent to --format json', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'context', '--json'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe('1');
  }, 20000);

  test('--ndjson is equivalent to --format ndjson', async () => {
    const result = await runProcess('npx', ['tsx', CLI_ENTRY, 'context', '--ndjson'], {cwd: CLI_CWD});

    expect(result.exitCode).toBe(0);
    const lines = result.stdout.trim().split('\n');
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]);
    expect(parsed.ok).toBe(true);
    expect(parsed.contractVersion).toBe('1');
  }, 20000);
});
