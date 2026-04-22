import {describe, expect, test, vi} from 'vitest';
import {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
  renderCommandResult,
  withCommandContext,
} from '../../src/cli/command-helpers.js';
import type {CommandContext} from '../../src/cli/command-context.js';
import type {AppConfig} from '../../src/core/config/load-config.js';
import type {ProjectContext} from '../../src/core/config/project-context.js';

const createMockContext = (format: 'text' | 'json' | 'ndjson', strict = false): CommandContext => ({
  cwd: '/repo',
  config: {} as AppConfig,
  project: {} as ProjectContext,
  printer: {
    format,
    write: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
  strict,
});

describe('addOutputFormatOption', () => {
  test('adds format options to command', () => {
    const mockCommand = new Command('mock');
    const option = vi.spyOn(mockCommand, 'option');

    const result = addOutputFormatOption(mockCommand);

    expect(result).toBe(mockCommand);
    expect(option).toHaveBeenCalledWith('--format <format>', expect.any(String), 'text');
    expect(option).toHaveBeenCalledWith('--json', expect.any(String));
    expect(option).toHaveBeenCalledWith('--ndjson', expect.any(String));
  });

  test('adds format options with custom default', () => {
    const mockCommand = new Command('mock');
    const option = vi.spyOn(mockCommand, 'option');

    addOutputFormatOption(mockCommand, 'json');

    expect(option).toHaveBeenCalledWith('--format <format>', expect.any(String), 'json');
  });
});

describe('renderCommandResult', () => {
  test('renders text output when format is text', () => {
    const mockContext = createMockContext('text');

    renderCommandResult(mockContext, {data: 'result'}, {text: 'Text output'});

    expect(mockContext.printer.write).toHaveBeenCalledWith('Text output');
  });

  test('renders JSON output when format is json', () => {
    const mockContext = createMockContext('json');

    renderCommandResult(mockContext, {data: 'result'}, {json: () => ({data: 'json-data'})});

    expect(mockContext.printer.write).toHaveBeenCalledWith({data: 'json-data'});
  });

  test('calls text function when provided', () => {
    const mockContext = createMockContext('text');

    const textFn = vi.fn(() => 'computed text');
    renderCommandResult(mockContext, {value: 42}, {text: textFn});

    expect(textFn).toHaveBeenCalledWith({value: 42});
    expect(mockContext.printer.write).toHaveBeenCalledWith('computed text');
  });

  test('calls json function when provided', () => {
    const mockContext = createMockContext('json');

    const jsonFn = vi.fn(() => ({computed: true}));
    renderCommandResult(mockContext, {value: 42}, {json: jsonFn});

    expect(jsonFn).toHaveBeenCalledWith({value: 42});
    expect(mockContext.printer.write).toHaveBeenCalledWith({computed: true});
  });

  test('uses result as fallback when text is undefined', () => {
    const mockContext = createMockContext('text');

    renderCommandResult(mockContext, {data: 'fallback'});

    expect(mockContext.printer.write).toHaveBeenCalledWith({data: 'fallback'});
  });

  test('sets exit code when provided', () => {
    const mockContext = createMockContext('text');

    renderCommandResult(mockContext, {}, {text: '', exitCode: 42});

    expect(process.exitCode).toBe(42);
    process.exitCode = undefined;
  });

  test('calls exit code function when provided', () => {
    const mockContext = createMockContext('text');

    const exitCodeFn = vi.fn(() => 5);
    renderCommandResult(mockContext, {value: 100}, {text: '', exitCode: exitCodeFn});

    expect(exitCodeFn).toHaveBeenCalledWith({value: 100});
    expect(process.exitCode).toBe(5);
    process.exitCode = undefined;
  });

  test('wraps output in success envelope when strict mode is enabled in json format', () => {
    const mockContext = createMockContext('json', true);

    renderCommandResult(mockContext, {data: 'result'}, {json: () => ({data: 'json-data'})});

    expect(mockContext.printer.write).toHaveBeenCalledWith({
      ok: true,
      data: {data: 'json-data'},
    });
  });

  test('wraps output in success envelope when strict mode is enabled in ndjson format', () => {
    const mockContext = createMockContext('ndjson', true);

    renderCommandResult(mockContext, {data: 'result'}, {json: () => ({data: 'ndjson-data'})});

    expect(mockContext.printer.write).toHaveBeenCalledWith({
      ok: true,
      data: {data: 'ndjson-data'},
    });
  });

  test('does not wrap in envelope when strict mode is disabled', () => {
    const mockContext = createMockContext('json', false);

    renderCommandResult(mockContext, {data: 'result'}, {json: () => ({data: 'json-data'})});

    expect(mockContext.printer.write).toHaveBeenCalledWith({data: 'json-data'});
  });

  test('does not wrap in envelope in text format even with strict mode', () => {
    const mockContext = createMockContext('text', true);

    renderCommandResult(mockContext, {data: 'result'}, {text: 'Text output'});

    expect(mockContext.printer.write).toHaveBeenCalledWith('Text output');
  });

  test('wraps raw result when json option is undefined and strict mode is enabled', () => {
    const mockContext = createMockContext('json', true);

    renderCommandResult(mockContext, {data: 'result'});

    expect(mockContext.printer.write).toHaveBeenCalledWith({
      ok: true,
      data: {data: 'result'},
    });
  });
});

describe('withCommandContext', () => {
  test('creates context and runs action', async () => {
    const action = vi.fn<(context: CommandContext) => Promise<void>>(() => Promise.resolve());

    await withCommandContext({format: 'json'}, action);

    expect(action).toHaveBeenCalled();
    const context = action.mock.calls[0]?.[0];
    expect(context.printer.format).toBe('json');
  });

  test('defaults to text format when not specified', async () => {
    const action = vi.fn<(context: CommandContext) => Promise<void>>(() => Promise.resolve());

    await withCommandContext({}, action);

    const context = action.mock.calls[0]?.[0];
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
