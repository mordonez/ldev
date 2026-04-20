import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {resolveLiferayConfig} from '../../src/core/http/config.js';
import {runLiferayConfigGet, runLiferayConfigSet} from '../../src/features/liferay/liferay-config.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

describe('liferay-config', () => {
  test('gets and sets portal properties in local config files', async () => {
    const repoRoot = createTempDir('dev-cli-liferay-config-');
    const liferayDir = path.join(repoRoot, 'liferay');
    await fs.ensureDir(path.join(liferayDir, 'configs', 'dockerenv'));
    await fs.writeFile(path.join(liferayDir, 'configs', 'dockerenv', 'portal-ext.properties'), 'foo=bar\n');

    const config = makeConfig(repoRoot);
    const initial = await runLiferayConfigGet(config, {target: 'foo', source: 'source'});
    expect(initial.type).toBe('portal-property');
    if (initial.type === 'portal-property') {
      expect(initial.value).toBe('bar');
    }

    const updated = await runLiferayConfigSet(config, {target: 'foo', value: 'baz', source: 'source'});
    expect(updated.type).toBe('portal-property');
    expect(await fs.readFile(path.join(liferayDir, 'configs', 'dockerenv', 'portal-ext.properties'), 'utf8')).toContain(
      'foo=baz',
    );
  });

  test('gets and sets OSGi config values by pid', async () => {
    const repoRoot = createTempDir('dev-cli-liferay-config-osgi-');
    const pid = 'com.liferay.portal.search.configuration.SearchConfiguration';
    const liferayDir = path.join(repoRoot, 'liferay');
    const file = path.join(liferayDir, 'configs', 'dockerenv', 'osgi', 'configs', `${pid}.config`);
    await fs.ensureDir(path.dirname(file));
    await fs.writeFile(file, 'foo=bar\n');

    const config = makeConfig(repoRoot);
    const initial = await runLiferayConfigGet(config, {target: pid, source: 'source'});
    expect(initial.type).toBe('osgi-config');
    if (initial.type === 'osgi-config') {
      expect(initial.values.foo).toBe('bar');
    }

    const updated = await runLiferayConfigSet(config, {target: pid, key: 'foo', value: 'baz', source: 'source'});
    expect(updated.type).toBe('osgi-config');
    expect(await fs.readFile(file, 'utf8')).toContain('foo=baz');
  });
});

describe('resolveLiferayConfig', () => {
  test('falls back to docker bind ip and port', () => {
    const config = resolveLiferayConfig({
      processEnv: {},
      dockerEnv: {
        BIND_IP: '127.0.0.7',
        LIFERAY_HTTP_PORT: '8181',
      },
      localProfile: {},
    });

    expect(config.url).toBe('http://127.0.0.7:8181');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.User.everything.read');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.Content.everything.read');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.Site.everything.read');
    expect(config.timeoutSeconds).toBe(30);
  });

  test('prefers env over docker env and ignores profile runtime values', () => {
    const config = resolveLiferayConfig({
      processEnv: {
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'env-id',
      },
      localProfile: {},
      dockerEnv: {
        BIND_IP: '127.0.0.1',
        LIFERAY_HTTP_PORT: '8080',
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'docker-id',
        LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'docker-secret',
      },
    });

    expect(config.url).toBe('http://localhost:8080');
    expect(config.oauth2ClientId).toBe('env-id');
    expect(config.oauth2ClientSecret).toBe('docker-secret');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.User.everything.read');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.Content.everything.read');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.Site.everything.read');
    expect(config.timeoutSeconds).toBe(30);
  });

  test('prefers local profile over docker env for runtime auth', () => {
    const config = resolveLiferayConfig({
      processEnv: {},
      localProfile: {
        'liferay.url': 'http://local-profile:8082',
        'liferay.oauth2.clientId': 'local-id',
        'liferay.oauth2.clientSecret': 'local-secret',
      },
      dockerEnv: {
        BIND_IP: '127.0.0.1',
        LIFERAY_HTTP_PORT: '8080',
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'docker-id',
        LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'docker-secret',
      },
    });

    expect(config.url).toBe('http://local-profile:8082');
    expect(config.oauth2ClientId).toBe('local-id');
    expect(config.oauth2ClientSecret).toBe('local-secret');
  });
});

function makeConfig(repoRoot: string) {
  return {
    cwd: repoRoot,
    repoRoot,
    dockerDir: path.join(repoRoot, 'docker'),
    liferayDir: path.join(repoRoot, 'liferay'),
    files: {dockerEnv: null, liferayProfile: null},
    liferay: {
      url: 'http://localhost:8080',
      oauth2ClientId: '',
      oauth2ClientSecret: '',
      scopeAliases: '',
      timeoutSeconds: 5,
    },
  };
}
