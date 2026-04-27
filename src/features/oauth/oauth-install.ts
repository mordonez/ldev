import {randomUUID} from 'node:crypto';
import path from 'node:path';

import type {AppConfig} from '../../core/config/load-config.js';
import {LIFERAY_LOCAL_PROFILE_FILE} from '../../core/config/liferay-profile.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import type {Printer} from '../../core/output/printer.js';
import {
  resolveManagedOAuthScopeAliases,
  resolveOAuthScopeProfileAliases,
  type OAuthScopeProfileName,
} from './oauth-scope-aliases.js';
import {OAuthErrors} from './errors/oauth-error-factory.js';
import {writeCredentialsToLocalProfile} from './oauth-env.js';
import {deployBundledOAuthInstallerJar, writeOAuthInstallerOsgiConfig} from './oauth-install-bundle.js';
import {executeOAuthInstallerCommand, buildOAuthInstallGogoCommand, parseKeyValueOutput} from './oauth-install-gogo.js';
import {
  verifyProvisionedOAuthInstall,
  shouldSanitizeProvisionedOAuthConfig,
  shouldPersistProvisionedOAuthCredentials,
} from './oauth-install-verify.js';

export type OAuthInstallResult = {
  ok: true;
  bundleDeployed: boolean;
  bundleFile: string;
  scopeAliases: string[];
  localProfileUpdated: boolean;
  localProfileFile: string | null;
  command: string;
  companyId: string;
  companyWebId: string;
  userId: string;
  userEmail: string;
  externalReferenceCode: string;
  readWrite: {
    clientId: string;
    clientSecret: string;
  };
  readOnly: {
    clientId: string;
    clientSecret: string;
  } | null;
  verification: {
    attempted: boolean;
    verified: boolean;
    sanitized: boolean;
    tokenType: string | null;
    expiresIn: number | null;
    error: string | null;
  };
  rawOutput: string;
};

export type OAuthAdminUnblockResult = {
  ok: true;
  bundleDeployed: boolean;
  bundleFile: string;
  command: string;
  companyId: string;
  companyWebId: string;
  userId: string;
  userEmail: string;
  passwordReset: boolean;
  rawOutput: string;
};

export {deployBundledOAuthInstallerJar} from './oauth-install-bundle.js';
export {executeOAuthInstallerCommand, buildOAuthInstallGogoCommand, parseKeyValueOutput} from './oauth-install-gogo.js';
export {
  shouldSanitizeProvisionedOAuthConfig,
  shouldPersistProvisionedOAuthCredentials,
} from './oauth-install-verify.js';

export async function runOAuthInstall(
  config: AppConfig,
  options?: {
    companyId?: number;
    userId?: number;
    writeEnv?: boolean;
    extraScopeAliases?: string[];
    extraScopeProfiles?: OAuthScopeProfileName[];
    printer?: Printer;
  },
): Promise<OAuthInstallResult> {
  const scopeAliases = resolveConfiguredOAuthScopeAliases(
    config,
    options?.extraScopeAliases,
    options?.extraScopeProfiles,
  );

  if (shouldProvisionOAuthViaOsgiConfig(config)) {
    return provisionOAuthViaOsgiConfig(config, options, scopeAliases);
  }

  await writeOAuthInstallerOsgiConfig(config, {
    enabled: false,
    externalReferenceCode: 'ldev',
    appName: 'ldev',
    clientId: '',
    clientSecret: '',
    rotateClientSecret: false,
    scopeAliases,
    companyId: options?.companyId,
    userId: options?.userId,
  });

  const bundleTargetFile = await deployBundledOAuthInstallerJar(config, options?.printer);

  const gogoCommand = buildOAuthInstallGogoCommand(options?.companyId, options?.userId, scopeAliases);
  const rawOutput = await executeOAuthInstallCommand(config, gogoCommand);
  const parsed = parseOAuthInstallOutput(rawOutput);

  const localProfileFile = resolveOAuthLocalProfileFile(config);
  const localProfileUpdated =
    options?.writeEnv === true
      ? writeCredentialsToLocalProfile(
          localProfileFile,
          parsed.readWrite.clientId,
          parsed.readWrite.clientSecret,
          scopeAliases,
        )
      : false;

  return {
    ok: true,
    bundleDeployed: true,
    bundleFile: bundleTargetFile,
    scopeAliases,
    localProfileUpdated,
    localProfileFile,
    command: 'ldev:oauthInstall',
    companyId: parsed.companyId,
    companyWebId: parsed.companyWebId,
    userId: parsed.userId,
    userEmail: parsed.userEmail,
    externalReferenceCode: parsed.externalReferenceCode,
    readWrite: parsed.readWrite,
    readOnly: parsed.readOnly,
    verification: {
      attempted: false,
      verified: true,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: null,
    },
    rawOutput,
  };
}

export function formatOAuthInstall(result: OAuthInstallResult): string {
  const lines = [
    result.command === 'osgi-config'
      ? 'OAuth2 app provisioned via OSGi config and bundle auto-deploy'
      : `OAuth2 app installed via ${result.command}`,
    `Company: ${result.companyId} (${result.companyWebId})`,
    `User: ${result.userId} (${result.userEmail})`,
    `Bundle: ${result.bundleFile}`,
    `Scopes: ${result.scopeAliases.length}`,
    `LIFERAY_CLI_OAUTH2_CLIENT_ID=${result.readWrite.clientId}`,
    `LIFERAY_CLI_OAUTH2_CLIENT_SECRET=${result.readWrite.clientSecret}`,
  ];

  if (result.readOnly) {
    lines.push('');
    lines.push('--- App read-only ---');
    lines.push(`LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID=${result.readOnly.clientId}`);
    lines.push(`LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET=${result.readOnly.clientSecret}`);
  }

  if (result.localProfileUpdated && result.localProfileFile) {
    lines.push('');
    lines.push(`.liferay-cli.local.yml updated: ${result.localProfileFile}`);
  }

  if (result.verification.attempted) {
    lines.push('');
    lines.push(
      result.verification.verified
        ? `OAuth token verified (${result.verification.tokenType}, expiresIn=${result.verification.expiresIn})`
        : `OAuth token verification pending: ${result.verification.error ?? 'unknown error'}`,
    );
  }

  if (result.verification.sanitized) {
    lines.push('OSGi config sanitized after the install attempt');
  }

  return lines.join('\n');
}

async function provisionOAuthViaOsgiConfig(
  config: AppConfig,
  options?: {
    companyId?: number;
    userId?: number;
    writeEnv?: boolean;
    extraScopeAliases?: string[];
    extraScopeProfiles?: OAuthScopeProfileName[];
    printer?: Printer;
  },
  scopeAliases?: string[],
): Promise<OAuthInstallResult> {
  const readWrite = {
    clientId: buildGeneratedClientId('ldev'),
    clientSecret: buildGeneratedClientSecret(),
  };
  const resolvedScopeAliases =
    scopeAliases ?? resolveConfiguredOAuthScopeAliases(config, options?.extraScopeAliases, options?.extraScopeProfiles);

  const bundleFile = await deployBundledOAuthInstallerJar(config, options?.printer);
  await writeOAuthInstallerOsgiConfig(config, {
    enabled: true,
    externalReferenceCode: 'ldev',
    appName: 'ldev',
    clientId: readWrite.clientId,
    clientSecret: readWrite.clientSecret,
    rotateClientSecret: true,
    scopeAliases: resolvedScopeAliases,
    companyId: options?.companyId,
    userId: options?.userId,
  });

  const localProfileFile = resolveOAuthLocalProfileFile(config);
  const verification = await verifyProvisionedOAuthInstall(config, readWrite);
  const sanitizeAfterProvision = shouldSanitizeProvisionedOAuthConfig(verification);
  const persistLocalProfile = shouldPersistProvisionedOAuthCredentials(verification);

  if (sanitizeAfterProvision) {
    await writeOAuthInstallerOsgiConfig(config, {
      enabled: false,
      externalReferenceCode: 'ldev',
      appName: 'ldev',
      clientId: '',
      clientSecret: '',
      rotateClientSecret: false,
      scopeAliases: resolvedScopeAliases,
      companyId: options?.companyId,
      userId: options?.userId,
    });
  }

  const localProfileUpdated =
    persistLocalProfile && options?.writeEnv === true
      ? writeCredentialsToLocalProfile(
          localProfileFile,
          readWrite.clientId,
          readWrite.clientSecret,
          resolvedScopeAliases,
        )
      : false;

  return {
    ok: true,
    bundleDeployed: true,
    bundleFile,
    scopeAliases: resolvedScopeAliases,
    localProfileUpdated,
    localProfileFile,
    command: 'osgi-config',
    companyId: options?.companyId ? String(options.companyId) : 'pending',
    companyWebId: 'pending',
    userId: options?.userId ? String(options.userId) : 'pending',
    userEmail: 'pending',
    externalReferenceCode: 'ldev',
    readWrite,
    readOnly: null,
    verification: {
      ...verification,
      sanitized: sanitizeAfterProvision,
    },
    rawOutput: '',
  };
}

async function executeOAuthInstallCommand(config: AppConfig, command: string): Promise<string> {
  return executeOAuthInstallerCommand(config, command, (output) => output.includes('LIFERAY_CLI_OAUTH2_CLIENT_ID='));
}

function parseOAuthInstallOutput(output: string): {
  companyId: string;
  companyWebId: string;
  userId: string;
  userEmail: string;
  externalReferenceCode: string;
  readWrite: {
    clientId: string;
    clientSecret: string;
  };
  readOnly: {
    clientId: string;
    clientSecret: string;
  } | null;
} {
  const values = parseKeyValueOutput(output);

  const requiredKeys = [
    'companyId',
    'companyWebId',
    'userId',
    'userEmail',
    'externalReferenceCode',
    'LIFERAY_CLI_OAUTH2_CLIENT_ID',
    'LIFERAY_CLI_OAUTH2_CLIENT_SECRET',
  ];

  for (const key of requiredKeys) {
    if (!values[key]) {
      throw OAuthErrors.installParseError(`OAuth installer output is missing '${key}'.`);
    }
  }

  return {
    companyId: values.companyId,
    companyWebId: values.companyWebId,
    userId: values.userId,
    userEmail: values.userEmail,
    externalReferenceCode: values.externalReferenceCode,
    readWrite: {
      clientId: values.LIFERAY_CLI_OAUTH2_CLIENT_ID,
      clientSecret: values.LIFERAY_CLI_OAUTH2_CLIENT_SECRET,
    },
    readOnly:
      values.LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID && values.LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET
        ? {
            clientId: values.LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID,
            clientSecret: values.LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET,
          }
        : null,
  };
}

function resolveOAuthLocalProfileFile(config: AppConfig): string | null {
  if (config.files.liferayLocalProfile) {
    return config.files.liferayLocalProfile;
  }

  if (config.repoRoot) {
    return path.join(config.repoRoot, LIFERAY_LOCAL_PROFILE_FILE);
  }

  return null;
}

function resolveConfiguredOAuthScopeAliases(
  config: AppConfig,
  extraScopeAliases?: string[],
  extraScopeProfiles?: OAuthScopeProfileName[],
): string[] {
  return resolveManagedOAuthScopeAliases([
    ...config.liferay.scopeAliases.split(','),
    ...resolveOAuthScopeProfileAliases(extraScopeProfiles ?? []),
    ...(extraScopeAliases ?? []),
  ]);
}

function shouldProvisionOAuthViaOsgiConfig(config: AppConfig): boolean {
  if (!config.repoRoot) {
    return false;
  }

  return resolveProjectContext({cwd: config.cwd}).projectType === 'blade-workspace';
}

function buildGeneratedClientId(prefix: string): string {
  return `${prefix}-${randomUUID().replaceAll('-', '').slice(0, 12)}`;
}

function buildGeneratedClientSecret(): string {
  return `secret-${randomUUID()}`;
}
