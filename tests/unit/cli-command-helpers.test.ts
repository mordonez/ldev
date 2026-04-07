import {describe, expect, test, vi} from 'vitest';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
  renderCommandResult,
  withCommandContext,
} from '../../src/cli/command-helpers.js';
import type {CommandContext} from '../../src/cli/command-context.js';

describe('addOutputFormatOption', () => {
  test('adds format options to command', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockCommand: any = {
      option: vi.fn().mockReturnThis(),
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const result = addOutputFormatOption(mockCommand);

    expect(result).toBe(mockCommand);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockCommand.option).toHaveBeenCalledWith('--format <format>', expect.any(String), 'text');
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockCommand.option).toHaveBeenCalledWith('--json', expect.any(String));
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockCommand.option).toHaveBeenCalledWith('--ndjson', expect.any(String));
  });

  test('adds format options with custom default', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockCommand: any = {
      option: vi.fn().mockReturnThis(),
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    addOutputFormatOption(mockCommand, 'json');

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockCommand.option).toHaveBeenCalledWith('--format <format>', expect.any(String), 'json');
  });
});

describe('renderCommandResult', () => {
  test('renders text output when format is text', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const mockContext: CommandContext = {
      printer: {
        format: 'text',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    } as any;

    renderCommandResult(mockContext, {data: 'result'}, {text: 'Text output'});

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    expect(mockContext.printer.write).toHaveBeenCalledWith('Text output');
  });

  test('renders JSON output when format is json', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'json',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    renderCommandResult(mockContext, {data: 'result'}, {json: {data: 'json-data'}});

    expect(mockContext.printer.write).toHaveBeenCalledWith({data: 'json-data'});
  });

  test('calls text function when provided', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'text',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    const textFn = vi.fn(() => 'computed text');
    renderCommandResult(mockContext, {value: 42}, {text: textFn});

    expect(textFn).toHaveBeenCalledWith({value: 42});
    expect(mockContext.printer.write).toHaveBeenCalledWith('computed text');
  });

  test('calls json function when provided', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'json',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    const jsonFn = vi.fn(() => ({computed: true}));
    renderCommandResult(mockContext, {value: 42}, {json: jsonFn});

    expect(jsonFn).toHaveBeenCalledWith({value: 42});
    expect(mockContext.printer.write).toHaveBeenCalledWith({computed: true});
  });

  test('uses result as fallback when text is undefined', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'text',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    renderCommandResult(mockContext, {data: 'fallback'});

    expect(mockContext.printer.write).toHaveBeenCalledWith({data: 'fallback'});
  });

  test('sets exit code when provided', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'text',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    renderCommandResult(mockContext, {}, {text: '', exitCode: 42});

    expect(process.exitCode).toBe(42);
    process.exitCode = undefined;
  });

  test('calls exit code function when provided', () => {
    const mockContext: CommandContext = {
      printer: {
        format: 'text',
        write: vi.fn(),
        error: vi.fn(),
        info: vi.fn(),
      },
    };

    const exitCodeFn = vi.fn(() => 5);
    renderCommandResult(mockContext, {value: 100}, {text: '', exitCode: exitCodeFn});

    expect(exitCodeFn).toHaveBeenCalledWith({value: 100});
    expect(process.exitCode).toBe(5);
    process.exitCode = undefined;
  });
});

describe('withCommandContext', () => {
  test('creates context and runs action', async () => {
    const action = vi.fn(() => Promise.resolve());

    await withCommandContext({format: 'json'}, action);

    expect(action).toHaveBeenCalled();
    const context = action.mock.calls[0][0];
    expect(context.printer.format).toBe('json');
  });

  test('defaults to text format when not specified', async () => {
    const action = vi.fn(() => Promise.resolve());

    await withCommandContext({}, action);

    const context = action.mock.calls[0][0];
    expect(context.printer.format).toBe('text');
  });

  test('propagates action errors', async () => {
    const error = new Error('Action failed');
    const action = vi.fn(() => Promise.reject(error));

    await expect(withCommandContext({}, action)).rejects.toThrow('Action failed');
  });
});

describe('createFormattedAction', () => {
  test('creates action that renders result', async () => {
    const run = vi.fn(() => Promise.resolve({success: true}));
    const action = createFormattedAction(run, {text: 'Done'});

    await action({format: 'text'});

    expect(run).toHaveBeenCalled();
  });

  test('creates action with dynamic render options', async () => {
    const run = vi.fn(() => Promise.resolve({status: 'ok'}));
    const renderFn = vi.fn(() => ({text: 'Dynamic'}));
    const action = createFormattedAction(run, renderFn);

    await action({format: 'text'});

    expect(run).toHaveBeenCalled();
    expect(renderFn).toHaveBeenCalled();
  });
});

describe('createFormattedArgumentAction', () => {
  test('creates action that receives argument', async () => {
    const run = vi.fn(() => Promise.resolve({result: 'data'}));
    const action = createFormattedArgumentAction(run, {text: 'Done'});

    await action('my-arg', {format: 'text'});

    expect(run).toHaveBeenCalledWith(expect.any(Object), 'my-arg', expect.any(Object));
  });

  test('creates action with dynamic render options', async () => {
    const run = vi.fn(() => Promise.resolve({result: 'data'}));
    const renderFn = vi.fn(() => ({text: 'Dynamic'}));
    const action = createFormattedArgumentAction(run, renderFn);

    await action('arg-value', {format: 'text'});

    expect(run).toHaveBeenCalled();
    expect(renderFn).toHaveBeenCalled();
  });
});
