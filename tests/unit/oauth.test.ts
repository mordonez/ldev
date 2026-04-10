import {describe, expect, test} from 'vitest';

import {
  buildOAuthInstallGogoCommand,
  formatOAuthInstall,
  parseKeyValueOutput,
  shouldPersistProvisionedOAuthCredentials,
  shouldSanitizeProvisionedOAuthConfig,
  type OAuthInstallResult,
} from '../../src/features/oauth/oauth-install.js';
import {formatOAuthAdminUnblock} from '../../src/features/oauth/oauth-admin-unblock.js';
import {
  resolveManagedOAuthScopeAliases,
  resolveOAuthScopeProfileAliases,
  resolveOAuthScopeProfileNames,
  PORTAL_INVENTORY_SCOPE_ALIAS,
} from '../../src/features/oauth/oauth-scope-aliases.js';

// ---------------------------------------------------------------------------
// oauth-scope-aliases
// ---------------------------------------------------------------------------

describe('resolveManagedOAuthScopeAliases', () => {
  test('always includes the portal inventory scope alias', () => {
    const result = resolveManagedOAuthScopeAliases([]);

    expect(result).toContain(PORTAL_INVENTORY_SCOPE_ALIAS);
  });

  test('deduplicates aliases', () => {
    const alias = 'Liferay.Headless.Delivery.everything.read';
    const result = resolveManagedOAuthScopeAliases([alias, alias, alias]);

    const count = result.filter((a) => a === alias).length;
    expect(count).toBe(1);
  });

  test('trims whitespace from aliases', () => {
    const result = resolveManagedOAuthScopeAliases(['  some.scope  ']);

    expect(result).toContain('some.scope');
    expect(result).not.toContain('  some.scope  ');
  });

  test('ignores null and undefined entries', () => {
    const result = resolveManagedOAuthScopeAliases([null, undefined, 'valid.scope']);

    expect(result).toContain('valid.scope');
    // no empty strings
    expect(result.every((a) => a.trim() !== '')).toBe(true);
  });
});

describe('resolveOAuthScopeProfileNames', () => {
  test('returns all defined profile names', () => {
    const names = resolveOAuthScopeProfileNames();

    expect(names).toContain('content-authoring');
    expect(names).toContain('site-admin');
    expect(names).toContain('objects');
    expect(names).toContain('max-test');
  });
});

describe('resolveOAuthScopeProfileAliases', () => {
  test('includes aliases from requested profiles', () => {
    const result = resolveOAuthScopeProfileAliases(['content-authoring']);

    expect(result).toContain('Liferay.Headless.Admin.Content.everything.read');
    expect(result).toContain('Liferay.Headless.Admin.Content.everything.write');
  });

  test('always appends portal inventory alias', () => {
    const result = resolveOAuthScopeProfileAliases(['site-admin']);

    expect(result).toContain(PORTAL_INVENTORY_SCOPE_ALIAS);
  });

  test('max-test profile contains aliases from all other profiles', () => {
    const maxTest = resolveOAuthScopeProfileAliases(['max-test']);
    const contentAuthoring = resolveOAuthScopeProfileAliases(['content-authoring']);

    for (const alias of contentAuthoring) {
      expect(maxTest).toContain(alias);
    }
  });
});

// ---------------------------------------------------------------------------
// oauth-install — parseKeyValueOutput
// ---------------------------------------------------------------------------

describe('parseKeyValueOutput', () => {
  test('parses simple key=value lines', () => {
    const output = 'companyId=20097\ncompanyWebId=liferay.com\n';
    const result = parseKeyValueOutput(output);

    expect(result.companyId).toBe('20097');
    expect(result.companyWebId).toBe('liferay.com');
  });

  test('strips gogo shell prompt prefix from lines', () => {
    const output = 'g! LIFERAY_CLI_OAUTH2_CLIENT_ID=my-client-id\n';
    const result = parseKeyValueOutput(output);

    expect(result.LIFERAY_CLI_OAUTH2_CLIENT_ID).toBe('my-client-id');
  });

  test('ignores telnet connection banner lines', () => {
    const output = ['Trying 127.0.0.1...', 'Connected to localhost.', "Escape character is '^]'.", 'key=value'].join(
      '\n',
    );
    const result = parseKeyValueOutput(output);

    expect(result.key).toBe('value');
    expect(Object.keys(result)).not.toContain('Trying 127.0.0.1...');
  });

  test('ignores lines without an equals sign', () => {
    const output = 'no-equals-here\nkey=val\n';
    const result = parseKeyValueOutput(output);

    expect(Object.keys(result)).toHaveLength(1);
    expect(result.key).toBe('val');
  });

  test('uses only the first equals sign as separator', () => {
    const output = 'clientSecret=abc=def==ghi\n';
    const result = parseKeyValueOutput(output);

    expect(result.clientSecret).toBe('abc=def==ghi');
  });
});

// ---------------------------------------------------------------------------
// oauth-install — buildOAuthInstallGogoCommand
// ---------------------------------------------------------------------------

describe('buildOAuthInstallGogoCommand', () => {
  test('returns base command without arguments', () => {
    expect(buildOAuthInstallGogoCommand()).toBe('ldev:oauthInstall');
  });

  test('appends companyId when provided', () => {
    expect(buildOAuthInstallGogoCommand(20097)).toBe('ldev:oauthInstall 20097');
  });

  test('appends both companyId and userId when both provided', () => {
    expect(buildOAuthInstallGogoCommand(20097, 10)).toBe('ldev:oauthInstall 20097 10');
  });
});

// ---------------------------------------------------------------------------
// oauth-install — formatOAuthInstall
// ---------------------------------------------------------------------------

function makeOAuthInstallResult(overrides?: Partial<OAuthInstallResult>): OAuthInstallResult {
  return {
    ok: true,
    bundleDeployed: true,
    bundleFile: '/deploy/ldev.jar',
    scopeAliases: ['scope.read', 'scope.write'],
    localProfileUpdated: false,
    localProfileFile: null,
    command: 'ldev:oauthInstall',
    companyId: '20097',
    companyWebId: 'liferay.com',
    userId: '10',
    userEmail: 'admin@liferay.com',
    externalReferenceCode: 'ldev',
    readWrite: {clientId: 'my-client', clientSecret: 'my-secret'},
    readOnly: null,
    verification: {attempted: false, verified: true, sanitized: false, tokenType: null, expiresIn: null, error: null},
    rawOutput: '',
    ...overrides,
  };
}

describe('formatOAuthInstall', () => {
  test('includes company, user, credentials and scope count', () => {
    const result = formatOAuthInstall(makeOAuthInstallResult());

    expect(result).toContain('20097');
    expect(result).toContain('liferay.com');
    expect(result).toContain('my-client');
    expect(result).toContain('my-secret');
    expect(result).toContain('Scopes: 2');
  });

  test('mentions osgi-config when command is osgi-config', () => {
    const result = formatOAuthInstall(makeOAuthInstallResult({command: 'osgi-config'}));

    expect(result).toContain('OSGi config');
  });

  test('includes read-only credentials block when readOnly is set', () => {
    const result = formatOAuthInstall(
      makeOAuthInstallResult({
        readOnly: {clientId: 'ro-client', clientSecret: 'ro-secret'},
      }),
    );

    expect(result).toContain('ro-client');
    expect(result).toContain('ro-secret');
  });

  test('omits read-only block when readOnly is null', () => {
    const result = formatOAuthInstall(makeOAuthInstallResult({readOnly: null}));

    expect(result).not.toContain('read-only');
  });

  test('includes local profile path when updated', () => {
    const result = formatOAuthInstall(
      makeOAuthInstallResult({localProfileUpdated: true, localProfileFile: '/repo/.liferay-cli.local.yml'}),
    );

    expect(result).toContain('.liferay-cli.local.yml');
    expect(result).toContain('/repo/.liferay-cli.local.yml');
  });

  test('includes verification status when attempted', () => {
    const result = formatOAuthInstall(
      makeOAuthInstallResult({
        verification: {
          attempted: true,
          verified: true,
          sanitized: false,
          tokenType: 'Bearer',
          expiresIn: 3600,
          error: null,
        },
      }),
    );

    expect(result).toContain('Bearer');
    expect(result).toContain('3600');
  });

  test('mentions config sanitization generically when flagged', () => {
    const result = formatOAuthInstall(
      makeOAuthInstallResult({
        verification: {
          attempted: true,
          verified: false,
          sanitized: true,
          tokenType: null,
          expiresIn: null,
          error: 'Token request failed (401) for clientId=ldev-bad: {"error":"invalid_client"}',
        },
      }),
    );

    expect(result).toContain('OSGi config sanitized after the install attempt');
    expect(result).not.toContain('successful verification');
  });
});

describe('provisioned OAuth verification policy', () => {
  test('sanitizes config after a terminal portal-side token error', () => {
    const verification = {
      attempted: true,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: 'Token request failed (401) for clientId=ldev-bad: {"error":"invalid_client"}',
    } satisfies OAuthInstallResult['verification'];

    expect(shouldSanitizeProvisionedOAuthConfig(verification)).toBe(true);
    expect(shouldPersistProvisionedOAuthCredentials(verification)).toBe(false);
  });

  test('keeps config enabled and persists credentials for offline workspace staging', () => {
    const verification = {
      attempted: true,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: 'connect ECONNREFUSED 127.0.0.1:8080',
    } satisfies OAuthInstallResult['verification'];

    expect(shouldSanitizeProvisionedOAuthConfig(verification)).toBe(false);
    expect(shouldPersistProvisionedOAuthCredentials(verification)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// oauth-admin-unblock — formatOAuthAdminUnblock
// ---------------------------------------------------------------------------

describe('formatOAuthAdminUnblock', () => {
  test('includes company, user and passwordReset flag', () => {
    const result = formatOAuthAdminUnblock({
      ok: true,
      bundleDeployed: true,
      bundleFile: '/deploy/ldev.jar',
      command: 'ldev:adminUnblock',
      companyId: '20097',
      companyWebId: 'liferay.com',
      userId: '10',
      userEmail: 'admin@liferay.com',
      passwordReset: true,
      rawOutput: '',
    });

    expect(result).toContain('ldev:adminUnblock');
    expect(result).toContain('20097');
    expect(result).toContain('admin@liferay.com');
    expect(result).toContain('passwordReset=true');
  });
});
