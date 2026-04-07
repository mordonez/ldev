import {describe, expect, test, vi, beforeEach, afterEach} from 'vitest';

import {createPrinter, withProgress} from '../../src/core/output/printer.js';

describe('withProgress', () => {
  let mockStderr: {write: ReturnType<typeof vi.fn>; isTTY: boolean; columns: number};

  beforeEach(() => {
    mockStderr = {
      write: vi.fn(() => true),
      isTTY: false,
      columns: 80,
    };

    Object.defineProperty(process, 'stderr', {
      value: mockStderr,
      writable: true,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  test('runs task directly when format is not text', async () => {
    const printer = createPrinter('json');
    const task = vi.fn(() => Promise.resolve('result'));

    const result = await withProgress(printer, 'Task', task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
    expect(mockStderr.write).not.toHaveBeenCalled();
  });

  test('shows progress message and completion when not TTY', async () => {
    const printer = createPrinter('text');
    const task = vi.fn(() => Promise.resolve('result'));
    mockStderr.isTTY = false;

    const result = await withProgress(printer, 'Loading data', task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
    expect(mockStderr.write).toHaveBeenCalled();
  });

  test('handles task errors when not TTY', async () => {
    const printer = createPrinter('text');
    const error = new Error('Task failed');
    const task = vi.fn(() => Promise.reject(error));
    mockStderr.isTTY = false;

    await expect(withProgress(printer, 'Loading', task)).rejects.toThrow('Task failed');
  });

  test('runs task silently in TTY mode during animation', async () => {
    const printer = createPrinter('text');
    const task = vi.fn(() => Promise.resolve('result'));
    mockStderr.isTTY = true;

    const result = await withProgress(printer, 'Processing', task);

    expect(result).toBe('result');
    expect(task).toHaveBeenCalled();
    expect(mockStderr.write).toHaveBeenCalled();
  });

  test('handles errors in TTY mode', async () => {
    const printer = createPrinter('text');
    const error = new Error('TTY task failed');
    const task = vi.fn(() => Promise.reject(error));
    mockStderr.isTTY = true;

    await expect(withProgress(printer, 'TTY task', task)).rejects.toThrow('TTY task failed');
  });

  test('shows progress animation in TTY mode', async () => {
    const printer = createPrinter('text');
    const task = vi.fn(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve('done'), 50);
        }),
    );
    mockStderr.isTTY = true;

    const result = await withProgress(printer, 'Animating', task);

    expect(result).toBe('done');
    expect(mockStderr.write.mock.calls.length).toBeGreaterThan(0);
  });
});
