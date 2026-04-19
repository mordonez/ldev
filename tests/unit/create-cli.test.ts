import {describe, expect, test} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';

describe('createCli', () => {
  test('registers global liferay connection options', () => {
    const cli = createCli();
    const optionNames = cli.options.map((option) => option.long);

    expect(optionNames).toContain('--liferay-url');
    expect(optionNames).toContain('--liferay-client-id');
    expect(optionNames).toContain('--liferay-client-secret');
    expect(optionNames).toContain('--liferay-client-secret-env');
    expect(optionNames).toContain('--liferay-scope-aliases');
    expect(optionNames).toContain('--liferay-timeout-seconds');
  });
});
