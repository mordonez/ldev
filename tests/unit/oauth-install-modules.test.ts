import {describe, expect, test} from 'vitest';

import {buildOAuthInstallerConfig} from '../../src/features/oauth/oauth-install-bundle.js';
import {parseKeyValueOutput, buildOAuthInstallGogoCommand} from '../../src/features/oauth/oauth-install-gogo.js';
import {
  shouldSanitizeProvisionedOAuthConfig,
  shouldPersistProvisionedOAuthCredentials,
} from '../../src/features/oauth/oauth-install-verify.js';

// ---------------------------------------------------------------------------
// buildOAuthInstallerConfig — pure OSGI config string builder
// ---------------------------------------------------------------------------

describe('buildOAuthInstallerConfig', () => {
  const baseOptions = {
    enabled: true,
    externalReferenceCode: 'my-app-erc',
    appName: 'My App',
    clientId: 'client-id-123',
    clientSecret: 's3cr3t',
    rotateClientSecret: false,
    scopeAliases: ['LIFERAY.EVERYTHING'],
  };

  test('includes enabled field as boolean string', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, enabled: true});
    expect(config).toContain('enabled=B"true"');
  });

  test('includes disabled enabled field', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, enabled: false});
    expect(config).toContain('enabled=B"false"');
  });

  test('includes externalReferenceCode', () => {
    const config = buildOAuthInstallerConfig(baseOptions);
    expect(config).toContain('externalReferenceCode=');
    expect(config).toContain('my-app-erc');
  });

  test('includes clientId', () => {
    const config = buildOAuthInstallerConfig(baseOptions);
    expect(config).toContain('clientId=');
    expect(config).toContain('client-id-123');
  });

  test('includes rotateClientSecret as boolean string', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, rotateClientSecret: true});
    expect(config).toContain('rotateClientSecret=B"true"');
  });

  test('includes scopeAliases', () => {
    const config = buildOAuthInstallerConfig(baseOptions);
    expect(config).toContain('scopeAliases=');
    expect(config).toContain('LIFERAY.EVERYTHING');
  });

  test('does not include companyId when not provided', () => {
    const config = buildOAuthInstallerConfig(baseOptions);
    expect(config).not.toContain('companyId=');
  });

  test('includes companyId when positive', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, companyId: 20116});
    expect(config).toContain('companyId=L"20116"');
  });

  test('does not include companyId when zero', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, companyId: 0});
    expect(config).not.toContain('companyId=');
  });

  test('includes userId when positive', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, userId: 12345});
    expect(config).toContain('userId=L"12345"');
  });

  test('does not include userId when zero', () => {
    const config = buildOAuthInstallerConfig({...baseOptions, userId: 0});
    expect(config).not.toContain('userId=');
  });

  test('ends with a newline', () => {
    const config = buildOAuthInstallerConfig(baseOptions);
    expect(config.endsWith('\n')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildOAuthInstallGogoCommand — builds the ldev:oauthInstall gogo command
// ---------------------------------------------------------------------------

describe('buildOAuthInstallGogoCommand', () => {
  test('returns base command when no args', () => {
    expect(buildOAuthInstallGogoCommand()).toBe('ldev:oauthInstall');
  });

  test('includes companyId when provided', () => {
    expect(buildOAuthInstallGogoCommand(20116)).toBe('ldev:oauthInstall 20116');
  });

  test('includes companyId and userId when both provided', () => {
    expect(buildOAuthInstallGogoCommand(20116, 12345)).toBe('ldev:oauthInstall 20116 12345');
  });

  test('uses base command when userId is provided without companyId', () => {
    // userId alone is not supported — only companyId goes without userId
    expect(buildOAuthInstallGogoCommand(undefined, 12345)).toBe('ldev:oauthInstall');
  });
});

// ---------------------------------------------------------------------------
// parseKeyValueOutput — parses gogo key=value output
// ---------------------------------------------------------------------------

describe('parseKeyValueOutput', () => {
  test('parses a simple key=value line', () => {
    const result = parseKeyValueOutput('clientId=my-id\nclientSecret=s3cr3t');
    expect(result).toEqual({clientId: 'my-id', clientSecret: 's3cr3t'});
  });

  test('strips leading "g! " prompt prefix', () => {
    const result = parseKeyValueOutput('g! clientId=my-id');
    expect(result).toEqual({clientId: 'my-id'});
  });

  test('ignores lines without =', () => {
    const result = parseKeyValueOutput('Connected.\nexternalReferenceCode=erc-123');
    expect(result).toEqual({externalReferenceCode: 'erc-123'});
  });

  test('ignores telnet preamble lines', () => {
    const lines = ['Trying 127.0.0.1...', 'Connected to 127.0.0.1.', "Escape character is '^]'.", 'key=val'];
    const result = parseKeyValueOutput(lines.join('\n'));
    expect(result).toEqual({key: 'val'});
  });

  test('returns empty object for empty output', () => {
    expect(parseKeyValueOutput('')).toEqual({});
  });

  test('handles first = as separator when value contains equals', () => {
    const result = parseKeyValueOutput('url=http://host:8080/o?foo=bar');
    expect(result).toEqual({url: 'http://host:8080/o?foo=bar'});
  });
});

// ---------------------------------------------------------------------------
// shouldSanitizeProvisionedOAuthConfig — pure predicate
// ---------------------------------------------------------------------------

describe('shouldSanitizeProvisionedOAuthConfig', () => {
  test('returns true when verified', () => {
    expect(
      shouldSanitizeProvisionedOAuthConfig({
        attempted: true,
        verified: true,
        sanitized: false,
        tokenType: 'Bearer',
        expiresIn: 600,
        error: null,
      }),
    ).toBe(true);
  });

  test('returns false when not attempted', () => {
    expect(
      shouldSanitizeProvisionedOAuthConfig({
        attempted: false,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: null,
      }),
    ).toBe(false);
  });

  test('returns true when error contains token request failed substring', () => {
    expect(
      shouldSanitizeProvisionedOAuthConfig({
        attempted: true,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: 'token request failed (401)',
      }),
    ).toBe(true);
  });

  test('returns false when error is unrelated', () => {
    expect(
      shouldSanitizeProvisionedOAuthConfig({
        attempted: true,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: 'connection refused',
      }),
    ).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// shouldPersistProvisionedOAuthCredentials — pure predicate
// ---------------------------------------------------------------------------

describe('shouldPersistProvisionedOAuthCredentials', () => {
  test('returns true when verified', () => {
    expect(
      shouldPersistProvisionedOAuthCredentials({
        attempted: true,
        verified: true,
        sanitized: false,
        tokenType: 'Bearer',
        expiresIn: 600,
        error: null,
      }),
    ).toBe(true);
  });

  test('returns true when not attempted (no portal available)', () => {
    expect(
      shouldPersistProvisionedOAuthCredentials({
        attempted: false,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: null,
      }),
    ).toBe(true);
  });

  test('returns false when attempted, not verified, and sanitize applies', () => {
    expect(
      shouldPersistProvisionedOAuthCredentials({
        attempted: true,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: 'token request failed (401)',
      }),
    ).toBe(false);
  });

  test('returns true when attempted, not verified, error is unrelated', () => {
    expect(
      shouldPersistProvisionedOAuthCredentials({
        attempted: true,
        verified: false,
        sanitized: false,
        tokenType: null,
        expiresIn: null,
        error: 'connection refused',
      }),
    ).toBe(true);
  });
});
