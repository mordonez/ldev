import fs from 'fs-extra';
import path from 'node:path';
import {afterEach, describe, expect, test, vi} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';

const capturedCalls: unknown[][] = [];
type CommandHelpersModule = Record<string, unknown>;

vi.mock('../../src/cli/command-helpers.js', async () => {
  const actual = (await vi.importActual('../../src/cli/command-helpers.js')) as unknown as CommandHelpersModule;

  return {
    ...actual,
    createFormattedAction:
      (_run: unknown, _render: unknown) =>
      (...args: unknown[]) => {
        capturedCalls.push(args);
      },
  };
});

describe('resource import-template command', () => {
  afterEach(() => {
    capturedCalls.length = 0;
    vi.resetModules();
  });

  test('does not force /global when a file under a site folder is imported without --site', async () => {
    const repoRoot = createTempDir('ldev-resource-import-template-command-site-');
    const templateDir = path.join(repoRoot, 'liferay', 'resources', 'journal', 'templates', 'actualitat');

    await fs.ensureDir(path.join(repoRoot, 'docker'));
    await fs.ensureDir(templateDir);
    await fs.writeFile(path.join(repoRoot, 'docker', '.env'), 'LIFERAY_CLI_URL=http://localhost:8080\n');
    await fs.writeFile(
      path.join(repoRoot, '.liferay-cli.yml'),
      ['paths:', '  templates: liferay/resources/journal/templates'].join('\n'),
    );
    await fs.writeFile(path.join(templateDir, 'BASIC.ftl'), 'hello');

    const {buildResourceCommand} = await import('../../src/commands/resource/resource.command.js');

    const cli = buildResourceCommand({description: 'test', helpText: ''});

    await cli.parseAsync(['import-template', '--template', 'BASIC', '--file', path.join(templateDir, 'BASIC.ftl')], {
      from: 'user',
    });

    expect(capturedCalls).toHaveLength(1);
    const options = capturedCalls[0]?.[0] as {site?: string; file?: string; template?: string};
    expect(options).toMatchObject({
      template: 'BASIC',
      file: path.join(templateDir, 'BASIC.ftl'),
    });
    expect(options.site).toBeUndefined();
  });
});
