import {describe, expect, test} from 'vitest';

import {createCli} from '../../src/cli/create-cli.js';

describe('createCli', () => {
  test('does not register liferay connection options on the root command', () => {
    const cli = createCli();
    const optionNames = cli.options.map((option) => option.long);

    expect(optionNames).not.toContain('--liferay-url');
    expect(optionNames).not.toContain('--liferay-client-id');
    expect(optionNames).not.toContain('--liferay-client-secret');
    expect(optionNames).not.toContain('--liferay-client-secret-env');
    expect(optionNames).not.toContain('--liferay-scope-aliases');
    expect(optionNames).not.toContain('--liferay-timeout-seconds');
  });

  test('registers liferay connection options on portal and resource namespaces', () => {
    const cli = createCli();
    const portal = cli.commands.find((command) => command.name() === 'portal');
    const resource = cli.commands.find((command) => command.name() === 'resource');

    expect(portal).toBeDefined();
    expect(resource).toBeDefined();

    const expectedOptions = [
      '--liferay-url',
      '--liferay-client-id',
      '--liferay-client-secret',
      '--liferay-client-secret-env',
      '--liferay-scope-aliases',
      '--liferay-timeout-seconds',
    ];

    const portalOptionNames = portal?.options.map((option) => option.long) ?? [];
    const resourceOptionNames = resource?.options.map((option) => option.long) ?? [];

    for (const optionName of expectedOptions) {
      expect(portalOptionNames).toContain(optionName);
      expect(resourceOptionNames).toContain(optionName);
    }
  });
});
