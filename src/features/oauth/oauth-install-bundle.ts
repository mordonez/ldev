import {fileURLToPath} from 'node:url';
import path from 'node:path';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {withProgress} from '../../core/output/printer.js';
import {runDockerComposeOrThrow} from '../../core/platform/docker.js';
import {resolveEnvContext} from '../env/env-files.js';

const BUNDLE_FILE_NAME = 'dev.mordonez.ldev.oauth2.app-1.0.0.jar';

export async function deployBundledOAuthInstallerJar(config: AppConfig, printer?: Printer): Promise<string> {
  const bundleSourceFile = resolveBundledOAuthInstallerJar();
  const bundleTargetFiles = resolveOAuthBundleDeployFiles(config);

  for (const bundleTargetFile of bundleTargetFiles) {
    await deployBundledOAuthInstaller(bundleSourceFile, bundleTargetFile, printer);
  }

  return bundleTargetFiles[0];
}

export function buildOAuthInstallerConfig(options: {
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

export async function writeOAuthInstallerOsgiConfig(
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

  await syncOAuthInstallerConfigToLiveContainer(config, fileName, content);
}

async function syncOAuthInstallerConfigToLiveContainer(
  config: AppConfig,
  fileName: string,
  content: string,
): Promise<void> {
  if (!config.dockerDir || !config.liferayDir || !config.repoRoot) {
    return;
  }

  await runDockerComposeOrThrow(
    config.dockerDir,
    ['exec', '-T', 'liferay', 'sh', '-lc', `cat > /opt/liferay/osgi/configs/${fileName}`],
    {
      input: content,
      stdin: 'pipe',
    },
  );
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

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new CliError(`Could not resolve the ldev package root from ${fromFile}`, {
        code: 'OAUTH_PACKAGE_ROOT_NOT_FOUND',
      });
    }
    current = parent;
  }
}

function quoteOsgiConfigValue(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}

function quoteOsgiConfigStringArray(values: string[]): string {
  return `[${values.map(quoteOsgiConfigValue).join(',')}]`;
}
