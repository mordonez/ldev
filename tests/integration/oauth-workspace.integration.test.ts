import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createTempWorkspace} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

describe('oauth workspace integration', () => {
  test('oauth install provisions workspace bundle/config/profile without gogo', async () => {
    const workspaceRoot = createTempWorkspace();
    await fs.ensureDir(path.join(workspaceRoot, 'bundles', 'deploy'));
    await fs.ensureDir(path.join(workspaceRoot, 'bundles', 'osgi', 'configs'));

    const result = await runCli(
      [
        'oauth',
        'install',
        '--scope-profile',
        'objects',
        '--scope',
        'custom.scope.everything.write',
        '--write-env',
        '--format',
        'json',
      ],
      {
        cwd: workspaceRoot,
        env: {
          ...process.env,
          LIFERAY_CLI_URL: 'http://127.0.0.1:9',
        },
      },
    );

    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.command).toBe('osgi-config');
    expect(parsed.localProfileUpdated).toBe(true);
    expect(parsed.readWrite.clientId).toContain('ldev-');
    expect(parsed.scopeAliases).toContain('custom.scope.everything.write');
    expect(parsed.scopeAliases).toContain('Liferay.Object.Admin.REST.everything.write');
    expect(parsed.scopeAliases).toContain('Liferay.Headless.Object.everything.write');
    expect(parsed.companyId).toBe('pending');
    expect(parsed.verification.attempted).toBe(true);
    expect(parsed.verification.verified).toBe(false);
    expect(parsed.verification.sanitized).toBe(false);

    expect(
      await fs.pathExists(
        path.join(workspaceRoot, 'configs', 'local', 'deploy', 'dev.mordonez.ldev.oauth2.app-1.0.0.jar'),
      ),
    ).toBe(true);
    expect(
      await fs.pathExists(
        path.join(
          workspaceRoot,
          'configs',
          'local',
          'osgi',
          'configs',
          'dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.config',
        ),
      ),
    ).toBe(true);

    const localProfile = await fs.readFile(path.join(workspaceRoot, '.liferay-cli.local.yml'), 'utf8');
    expect(localProfile).toContain('clientId:');
    expect(localProfile).toContain('clientSecret:');

    const osgiConfig = await fs.readFile(
      path.join(
        workspaceRoot,
        'configs',
        'local',
        'osgi',
        'configs',
        'dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.config',
      ),
      'utf8',
    );
    expect(osgiConfig).toContain('enabled=B"true"');
    expect(osgiConfig).toContain('externalReferenceCode="ldev"');
    expect(osgiConfig).toContain('clientId=');
    expect(osgiConfig).toContain('clientSecret=');
    expect(osgiConfig).toContain('scopeAliases=[');
    expect(osgiConfig).toContain('"custom.scope.everything.write"');
    expect(osgiConfig).toContain('"Liferay.Object.Admin.REST.everything.write"');
    expect(osgiConfig).toContain('"Liferay.Headless.Object.everything.write"');
    expect(osgiConfig).toContain('"Liferay.Headless.Discovery.API.everything.read"');
    expect(osgiConfig).toContain('"Liferay.Headless.Discovery.OpenAPI.everything.read"');
  }, 45000);
});
