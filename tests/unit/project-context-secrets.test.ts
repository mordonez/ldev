import {describe, expect, test, vi} from 'vitest';

import {findSensitiveProfileEntries, resolveProjectContext} from '../../src/core/config/project-context.js';

describe('project-context sensitive profile validation', () => {
  test('detects hardcoded secrets in profile keys', () => {
    const entries = findSensitiveProfileEntries({
      'liferay.oauth2.clientId': 'id-123',
      'liferay.oauth2.clientSecret': 'plain-secret',
      'integrations.apiKey': 'abc123',
      'liferay.oauth2.scopeAliases': 'scope-a',
    });

    expect(entries).toEqual(['integrations.apiKey', 'liferay.oauth2.clientSecret']);
  });

  test('ignores env/secret references in profile values', () => {
    const entries = findSensitiveProfileEntries({
      'liferay.oauth2.clientSecret': '${LIFERAY_CLI_OAUTH2_CLIENT_SECRET}',
      'integrations.apiKey': '$API_KEY',
      'vault.password': 'secret://kv/team/dev/password',
    });

    expect(entries).toEqual([]);
  });

  test('treats lowercase pseudo env references as sensitive literals', () => {
    const entries = findSensitiveProfileEntries({
      'integrations.token': '$token',
    });

    expect(entries).toEqual(['integrations.token']);
  });

  test('emits warning once per profile file when sensitive values are present', () => {
    const emitWarning = vi.spyOn(process, 'emitWarning').mockImplementation(() => {});
    const profilePath = `/repo/.liferay-cli-${Date.now()}-${Math.random().toString(16).slice(2)}.yml`;

    const dependencies = {
      detectRepoPaths: () => ({
        repoRoot: '/repo',
        dockerDir: '/repo/docker',
        liferayDir: '/repo/liferay',
        dockerEnvFile: '/repo/docker/.env',
        liferayProfileFile: profilePath,
      }),
      readEnvFile: () => ({}),
      readProfileFile: () => ({
        'liferay.url': 'http://localhost:8080',
        'liferay.oauth2.clientId': 'id-123',
        'liferay.oauth2.clientSecret': 'plain-secret',
      }),
    };

    resolveProjectContext({cwd: '/repo', dependencies});
    resolveProjectContext({cwd: '/repo', dependencies});

    expect(emitWarning).toHaveBeenCalledTimes(1);
    expect(String(emitWarning.mock.calls[0]?.[0])).toContain(profilePath);
    expect(String(emitWarning.mock.calls[0]?.[0])).toContain('liferay.oauth2.clientSecret');

    emitWarning.mockRestore();
  });
});
