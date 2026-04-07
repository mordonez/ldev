import {describe, expect, test, vi} from 'vitest';

import {runStep} from '../../src/core/output/run-step.js';

describe('runStep', () => {
  test('runs task through withProgress when printer is provided', async () => {
    const printer = {
      format: 'text' as const,
      write: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    const task = vi.fn(() => Promise.resolve('result'));

    const result = await runStep(printer, 'Test step', task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  test('runs task directly when printer is undefined', async () => {
    const task = vi.fn(() => Promise.resolve('result'));

    const result = await runStep(undefined, 'Test step', task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
  });

  test('propagates errors from task', async () => {
    const printer = {
      format: 'text' as const,
      write: vi.fn(),
      error: vi.fn(),
      info: vi.fn(),
    };

    const error = new Error('Task failed');
    const task = vi.fn(() => Promise.reject(error));

    await expect(runStep(printer, 'Test step', task)).rejects.toThrow('Task failed');
  });
});
