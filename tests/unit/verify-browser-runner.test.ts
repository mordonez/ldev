import {describe, expect, test} from 'vitest';

import {createPlaywrightBrowserRunner} from '../../src/features/verify/verify-browser-runner.js';

describe('createPlaywrightBrowserRunner', () => {
  test('throws a clear, actionable error when playwright is not installed', async () => {
    await expect(createPlaywrightBrowserRunner()).rejects.toThrow(/Playwright is not installed/);
    await expect(createPlaywrightBrowserRunner()).rejects.toThrow(/npm install --save-dev playwright/);
  });
});
