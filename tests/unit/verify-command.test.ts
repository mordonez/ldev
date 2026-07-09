import {describe, expect, test} from 'vitest';

import {createVerifyCommand} from '../../src/commands/verify/verify.command.js';

describe('createVerifyCommand', () => {
  test('registers a page subcommand with the expected options', () => {
    const command = createVerifyCommand();
    const page = command.commands.find((sub) => sub.name() === 'page');

    expect(page).toBeDefined();
    const optionNames = page?.options.map((option) => option.long) ?? [];

    expect(optionNames).toContain('--url');
    expect(optionNames).toContain('--screenshot');
    expect(optionNames).toContain('--skip-login');
    expect(optionNames).toContain('--login-email');
    expect(optionNames).toContain('--login-password');
    expect(optionNames).toContain('--json');
  });

  test('requires --url', () => {
    const command = createVerifyCommand();
    const page = command.commands.find((sub) => sub.name() === 'page');

    const requiredOption = page?.options.find((option) => option.long === '--url');
    expect(requiredOption?.mandatory).toBe(true);
  });
});
