import {describe, expect, test} from 'vitest';

import {resolveLiferayConfig} from '../../src/core/http/config.js';

describe('liferay config', () => {
  test('falls back to docker bind ip and port', () => {
    const config = resolveLiferayConfig({
      processEnv: {},
      dockerEnv: {
        BIND_IP: '127.0.0.7',
        LIFERAY_HTTP_PORT: '8181',
      },
      profile: {},
    });

    expect(config.url).toBe('http://127.0.0.7:8181');
    expect(config.scopeAliases).toContain('Liferay.Headless.Admin.User.everything.read');
    expect(config.timeoutSeconds).toBe(30);
  });

  test('prefers env over docker env over yaml and keeps profile url when bind ip is not specific', () => {
    const config = resolveLiferayConfig({
      processEnv: {
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'env-id',
      },
      dockerEnv: {
        BIND_IP: '127.0.0.1',
        LIFERAY_HTTP_PORT: '8080',
        LIFERAY_CLI_OAUTH2_CLIENT_ID: 'docker-id',
        LIFERAY_CLI_OAUTH2_CLIENT_SECRET: 'docker-secret',
      },
      profile: {
        'liferay.url': 'http://profile:7070',
        'liferay.oauth2.clientId': 'profile-id',
        'liferay.oauth2.clientSecret': 'profile-secret',
        'liferay.oauth2.scopeAliases': 'scope-a,scope-b',
      },
    });

    expect(config.url).toBe('http://profile:7070');
    expect(config.oauth2ClientId).toBe('env-id');
    expect(config.oauth2ClientSecret).toBe('docker-secret');
    expect(config.scopeAliases).toBe('scope-a,scope-b');
  });
});
