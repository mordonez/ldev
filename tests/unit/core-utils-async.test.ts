import {describe, expect, test} from 'vitest';

import {sleep} from '../../src/core/utils/async.js';

describe('sleep', () => {
  test('resolves after specified timeout', async () => {
    const start = Date.now();
    await sleep(50);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
  });

  test('returns a promise', () => {
    const result = sleep(10);
    expect(result).toBeInstanceOf(Promise);
  });

  test('resolves immediately with 0 timeout', async () => {
    const start = Date.now();
    await sleep(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(50);
  });
});
