import {describe, expect, test} from 'vitest';

import {CliError, resolveOutputFormatFromArgv, toCliErrorPayload} from '../../src/cli/errors.js';

describe('resolveOutputFormatFromArgv', () => {
  test('returns "json" when --json flag is present', () => {
    const result = resolveOutputFormatFromArgv(['command', '--json']);
    expect(result).toBe('json');
  });

  test('returns "ndjson" when --ndjson flag is present', () => {
    const result = resolveOutputFormatFromArgv(['command', '--ndjson']);
    expect(result).toBe('ndjson');
  });

  test('returns "text" by default', () => {
    const result = resolveOutputFormatFromArgv(['command']);
    expect(result).toBe('text');
  });

  test('returns "text" when no format flags are present', () => {
    const result = resolveOutputFormatFromArgv(['command', '--some-flag', 'value']);
    expect(result).toBe('text');
  });

  test('parses --format flag with value', () => {
    const result = resolveOutputFormatFromArgv(['command', '--format', 'json']);
    expect(result).toBe('json');
  });

  test('parses --format=value syntax', () => {
    const result = resolveOutputFormatFromArgv(['command', '--format=ndjson']);
    expect(result).toBe('ndjson');
  });

  test('prefers later format flag in argv', () => {
    const result = resolveOutputFormatFromArgv(['command', '--json', '--format=ndjson']);
    expect(result).toBe('ndjson');
  });

  test('ignores invalid format value', () => {
    const result = resolveOutputFormatFromArgv(['command', '--format', 'invalid']);
    expect(result).toBe('text');
  });

  test('ignores invalid --format=value syntax', () => {
    const result = resolveOutputFormatFromArgv(['command', '--format=invalid']);
    expect(result).toBe('text');
  });

  test('handles empty argv', () => {
    const result = resolveOutputFormatFromArgv([]);
    expect(result).toBe('text');
  });
});

describe('toCliErrorPayload', () => {
  test('converts CliError to payload with code and message', () => {
    const error = new CliError('Test message', {code: 'TEST_ERROR'});
    const payload = toCliErrorPayload(error);

    expect(payload).toEqual({
      ok: false,
      error: {
        code: 'TEST_ERROR',
        message: 'Test message',
      },
    });
  });

  test('includes details when present', () => {
    const error = new CliError('Test message', {code: 'TEST_ERROR', details: {extra: 'info'}});
    const payload = toCliErrorPayload(error);

    expect(payload).toEqual({
      ok: false,
      error: {
        code: 'TEST_ERROR',
        message: 'Test message',
        details: {extra: 'info'},
      },
    });
  });

  test('omits details when undefined', () => {
    const error = new CliError('Test message', {code: 'TEST_ERROR'});
    const payload = toCliErrorPayload(error);

    expect(payload.error).not.toHaveProperty('details');
  });

  test('uses default code when not provided', () => {
    const error = new CliError('Test message');
    const payload = toCliErrorPayload(error);

    expect(payload.error.code).toBe('CLI_ERROR');
    expect(payload.error.message).toBe('Test message');
  });
});
