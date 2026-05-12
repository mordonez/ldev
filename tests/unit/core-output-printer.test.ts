import {describe, expect, test, vi} from 'vitest';

import {createPrinter} from '../../src/core/output/printer.js';

describe('createPrinter', () => {
  test('creates printer with specified format', () => {
    const printer = createPrinter('json');
    expect(printer.format).toBe('json');
  });

  test('write outputs text string to stdout when format is text', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const printer = createPrinter('text');

    printer.write('hello');

    expect(stdout).toHaveBeenCalledWith('hello\n');
    stdout.mockRestore();
  });

  test('write outputs JSON object to stdout when format is text', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const printer = createPrinter('text');

    printer.write({foo: 'bar'});

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"foo"'));
    stdout.mockRestore();
  });

  test('write outputs NDJSON to stdout when format is ndjson', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const printer = createPrinter('ndjson');

    printer.write({foo: 'bar'});

    expect(stdout).toHaveBeenCalledWith('{"foo":"bar"}\n');
    stdout.mockRestore();
  });

  test('write outputs formatted JSON to stdout when format is json', () => {
    const stdout = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const printer = createPrinter('json');

    printer.write({foo: 'bar'});

    expect(stdout).toHaveBeenCalledWith(expect.stringContaining('"foo"'));
    stdout.mockRestore();
  });

  test('error outputs colored message to stderr when format is text', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const printer = createPrinter('text');

    printer.error('error message');

    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  test('error outputs plain message to stderr when format is json', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const printer = createPrinter('json');

    printer.error('error message');

    expect(stderr).toHaveBeenCalledWith('error message\n');
    stderr.mockRestore();
  });

  test('info outputs colored message to stderr when format is text', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const printer = createPrinter('text');

    printer.info('info message');

    expect(stderr).toHaveBeenCalled();
    stderr.mockRestore();
  });

  test('info outputs plain message to stderr when format is json', () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const printer = createPrinter('json');

    printer.info('info message');

    expect(stderr).toHaveBeenCalledWith('info message\n');
    stderr.mockRestore();
  });
});
