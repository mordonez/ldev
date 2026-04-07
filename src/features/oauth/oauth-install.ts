import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {LIFERAY_LOCAL_PROFILE_FILE} from '../../core/config/liferay-profile.js';
import {resolveProjectContext} from '../../core/config/project-context.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {createOAuthTokenClient} from '../../core/http/auth.js';
import {resolveEnvContext} from '../env/env-files.js';
import {runGogoCommand} from '../osgi/osgi-shared.js';
import {writeCredentialsToLocalProfile} from './oauth-env.js';
import {
  resolveManagedOAuthScopeAliases,
  resolveOAuthScopeProfileAliases,
  type OAuthScopeProfileName,
} from './oauth-scope-aliases.js';

const BUNDLE_FILE_NAME = 'dev.mordonez.ldev.oauth2.app-1.0.0.jar';

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

  if ((options?.extraScopeAliases?.length ?? 0) > 0) {
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
  }

  const bundleTargetFile = await deployBundledOAuthInstallerJar(config, options?.printer);

  const command = buildGogoCommand(options?.companyId, options?.userId);
  const rawOutput = await executeOAuthInstallCommand(config, command);
  const parsed = parseOAuthInstallOutput(rawOutput);

  const localProfileFile = resolveOAuthLocalProfileFile(config);
  const localProfileUpdated =
    options?.writeEnv === true
      ? await writeCredentialsToLocalProfile(
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
    command,
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
    lines.push('--- App read-only (solo lectura) ---');
    lines.push(`LIFERAY_CLI_OAUTH2_READONLY_CLIENT_ID=${result.readOnly.clientId}`);
    lines.push(`LIFERAY_CLI_OAUTH2_READONLY_CLIENT_SECRET=${result.readOnly.clientSecret}`);
  }

  if (result.localProfileUpdated && result.localProfileFile) {
    lines.push('');
    lines.push(`.liferay-cli.local.yml actualizado: ${result.localProfileFile}`);
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
    lines.push('OSGi config sanitized after successful verification');
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
  const localProfileUpdated =
    options?.writeEnv === true
      ? await writeCredentialsToLocalProfile(
          localProfileFile,
          readWrite.clientId,
          readWrite.clientSecret,
          resolvedScopeAliases,
        )
      : false;

  const verification = await verifyProvisionedOAuthInstall(config, readWrite);

  if (verification.verified) {
    await writeOAuthInstallerOsgiConfig(config, {
      enabled: false,
      externalReferenceCode: 'ldev',
      appName: 'ldev',
      clientId: readWrite.clientId,
      clientSecret: '',
      rotateClientSecret: false,
      scopeAliases: resolvedScopeAliases,
      companyId: options?.companyId,
      userId: options?.userId,
    });
  }

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
      sanitized: verification.verified,
    },
    rawOutput: '',
  };
}

async function deployBundledOAuthInstaller(sourceFile: string, targetFile: string, printer?: Printer): Promise<void> {
  const deploy = async () => {
    await fs.ensureDir(path.dirname(targetFile));
    await fs.copy(sourceFile, targetFile, {overwrite: true});
  };

  if (printer) {
    await withProgress(printer, 'Deploying bundled OAuth installer', deploy);
    return;
  }

  await deploy();
}

export async function deployBundledOAuthInstallerJar(config: AppConfig, printer?: Printer): Promise<string> {
  const bundleSourceFile = resolveBundledOAuthInstallerJar();
  const bundleTargetFiles = resolveOAuthBundleDeployFiles(config);

  for (const bundleTargetFile of bundleTargetFiles) {
    await deployBundledOAuthInstaller(bundleSourceFile, bundleTargetFile, printer);
  }

  return bundleTargetFiles[0];
}

function resolveOAuthBundleDeployFiles(config: AppConfig): string[] {
  if (config.dockerDir && config.liferayDir && config.repoRoot) {
    const envContext = resolveEnvContext(config);
    return [path.join(envContext.repoRoot, 'liferay', 'build', 'docker', 'deploy', BUNDLE_FILE_NAME)];
  }

  if (config.repoRoot) {
    return [
      path.join(config.repoRoot, 'bundles', 'deploy', BUNDLE_FILE_NAME),
      path.join(config.repoRoot, 'configs', 'local', 'deploy', BUNDLE_FILE_NAME),
    ];
  }

  throw new CliError('Could not resolve the deploy directory for the OAuth installer bundle.', {
    code: 'OAUTH_INSTALL_DEPLOY_DIR_NOT_FOUND',
  });
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

async function writeOAuthInstallerOsgiConfig(
  config: AppConfig,
  options: {
    enabled: boolean;
    externalReferenceCode: string;
    appName: string;
    clientId: string;
    clientSecret: string;
    rotateClientSecret: boolean;
    scopeAliases: string[];
    companyId?: number;
    userId?: number;
  },
): Promise<void> {
  const fileName = 'dev.mordonez.ldev.oauth2.app.configuration.LdevOAuth2AppConfiguration.config';
  const content = buildOAuthInstallerConfig(options);

  for (const targetFile of resolveOAuthInstallerConfigFiles(config, fileName)) {
    await fs.ensureDir(path.dirname(targetFile));
    await fs.writeFile(targetFile, content, 'utf8');
  }
}

function resolveOAuthInstallerConfigFiles(config: AppConfig, fileName: string): string[] {
  if (config.dockerDir && config.liferayDir && config.repoRoot) {
    return [
      path.join(config.liferayDir, 'configs', 'dockerenv', 'osgi', 'configs', fileName),
      path.join(config.liferayDir, 'build', 'docker', 'configs', 'dockerenv', 'osgi', 'configs', fileName),
    ];
  }

  if (config.repoRoot) {
    return [
      path.join(config.repoRoot, 'configs', 'local', 'osgi', 'configs', fileName),
      path.join(config.repoRoot, 'bundles', 'osgi', 'configs', fileName),
    ];
  }

  return [];
}

function buildOAuthInstallerConfig(options: {
  enabled: boolean;
  externalReferenceCode: string;
  appName: string;
  clientId: string;
  clientSecret: string;
  rotateClientSecret: boolean;
  scopeAliases: string[];
  companyId?: number;
  userId?: number;
}): string {
  const lines = [
    `enabled=B"${String(options.enabled)}"`,
    `externalReferenceCode=${quoteOsgiConfigValue(options.externalReferenceCode)}`,
    `appName=${quoteOsgiConfigValue(options.appName)}`,
    `clientId=${quoteOsgiConfigValue(options.clientId)}`,
    `clientSecret=${quoteOsgiConfigValue(options.clientSecret)}`,
    `rotateClientSecret=B"${String(options.rotateClientSecret)}"`,
    `scopeAliases=${quoteOsgiConfigStringArray(options.scopeAliases)}`,
  ];

  if (options.companyId && options.companyId > 0) {
    lines.push(`companyId=L"${options.companyId}"`);
  }

  if (options.userId && options.userId > 0) {
    lines.push(`userId=L"${options.userId}"`);
  }

  return `${lines.join('\n')}\n`;
}

function quoteOsgiConfigValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function quoteOsgiConfigStringArray(values: string[]): string {
  return `[${values.map(quoteOsgiConfigValue).join(',')}]`;
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

async function verifyProvisionedOAuthInstall(
  config: AppConfig,
  credentials: {
    clientId: string;
    clientSecret: string;
  },
): Promise<OAuthInstallResult['verification']> {
  if (!config.liferay.url || config.liferay.url.trim() === '') {
    return {
      attempted: false,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: null,
    };
  }

  try {
    const tokenClient = createOAuthTokenClient({
      invalidClientRetryDelayMs: 3000,
      invalidClientMaxWaitMs: 30000,
    });
    const token = await tokenClient.fetchClientCredentialsToken({
      ...config.liferay,
      oauth2ClientId: credentials.clientId,
      oauth2ClientSecret: credentials.clientSecret,
    });

    return {
      attempted: true,
      verified: true,
      sanitized: false,
      tokenType: token.tokenType,
      expiresIn: token.expiresIn,
      error: null,
    };
  } catch (error) {
    return {
      attempted: true,
      verified: false,
      sanitized: false,
      tokenType: null,
      expiresIn: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function executeOAuthInstallCommand(config: AppConfig, command: string): Promise<string> {
  return executeOAuthInstallerCommand(config, command, (output) => output.includes('LIFERAY_CLI_OAUTH2_CLIENT_ID='));
}

export async function executeOAuthInstallerCommand(
  config: AppConfig,
  command: string,
  successPredicate: (output: string) => boolean,
): Promise<string> {
  let lastOutput = '';

  for (let attempt = 1; attempt <= 12; attempt++) {
    const output = await runGogoCommand(config, command, process.env);
    lastOutput = output;

    if (output.includes('CommandNotFoundException')) {
      await delay(2000);
      continue;
    }

    if (output.includes('Unrecognized client authentication method')) {
      throw new CliError(
        'OAuth installer bundle is deployed, but the portal rejected the client authentication method.',
        {
          code: 'OAUTH_INSTALL_CLIENT_AUTH_METHOD',
        },
      );
    }

    if (output.includes('PortalException:')) {
      throw new CliError(output.trim(), {
        code: 'OAUTH_INSTALL_FAILED',
      });
    }

    if (successPredicate(output)) {
      return output;
    }

    await delay(2000);
  }

  throw new CliError(lastOutput.trim() || 'OAuth installer command did not become available in Gogo.', {
    code: 'OAUTH_INSTALL_GOGO_UNAVAILABLE',
  });
}

function buildGogoCommand(companyId?: number, userId?: number): string {
  if (companyId && userId) {
    return `ldev:oauthInstall ${companyId} ${userId}`;
  }

  if (companyId) {
    return `ldev:oauthInstall ${companyId}`;
  }

  return 'ldev:oauthInstall';
}

export function buildOAuthInstallGogoCommand(companyId?: number, userId?: number): string {
  return buildGogoCommand(companyId, userId);
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
  const values: Record<string, string> = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (
      !trimmedLine.includes('=') ||
      trimmedLine.startsWith('Trying ') ||
      trimmedLine.startsWith('Connected') ||
      trimmedLine.startsWith('Escape character')
    ) {
      continue;
    }

    const line = trimmedLine.startsWith('g! ') ? trimmedLine.slice(3).trim() : trimmedLine;
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

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
      throw new CliError(`OAuth installer output is missing '${key}'.`, {
        code: 'OAUTH_INSTALL_PARSE_ERROR',
      });
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

function resolveBundledOAuthInstallerJar(): string {
  const packageRoot = findPackageRoot(fileURLToPath(import.meta.url));
  const filePath = path.join(packageRoot, 'templates', 'bundles', BUNDLE_FILE_NAME);

  if (!fs.existsSync(filePath)) {
    throw new CliError(`Bundled OAuth installer not found: ${filePath}`, {
      code: 'OAUTH_INSTALL_BUNDLE_NOT_FOUND',
    });
  }

  return filePath;
}

export function parseKeyValueOutput(output: string): Record<string, string> {
  const values: Record<string, string> = {};

  for (const rawLine of output.split(/\r?\n/)) {
    const trimmedLine = rawLine.trim();
    if (
      !trimmedLine.includes('=') ||
      trimmedLine.startsWith('Trying ') ||
      trimmedLine.startsWith('Connected') ||
      trimmedLine.startsWith('Escape character')
    ) {
      continue;
    }

    const line = trimmedLine.startsWith('g! ') ? trimmedLine.slice(3).trim() : trimmedLine;
    const separatorIndex = line.indexOf('=');
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not resolve the ldev package root from ${fromFile}`);
    }
    current = parent;
  }
}
