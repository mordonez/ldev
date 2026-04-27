import type {AppConfig} from '../../core/config/load-config.js';
import type {Printer} from '../../core/output/printer.js';
import {OAuthErrors} from './errors/oauth-error-factory.js';
import {
  deployBundledOAuthInstallerJar,
  executeOAuthInstallerCommand,
  parseKeyValueOutput,
  type OAuthAdminUnblockResult,
} from './oauth-install.js';

export async function runOAuthAdminUnblock(
  config: AppConfig,
  options?: {
    companyId?: number;
    userId?: number;
    printer?: Printer;
  },
): Promise<OAuthAdminUnblockResult> {
  const bundleFile = await deployBundledOAuthInstallerJar(config, options?.printer);
  const command = buildAdminUnblockGogoCommand(options?.companyId, options?.userId);
  const rawOutput = await executeOAuthInstallerCommand(config, command, (output) => output.includes('passwordReset='));
  const values = parseKeyValueOutput(rawOutput);

  for (const key of ['companyId', 'companyWebId', 'userId', 'userEmail', 'passwordReset']) {
    if (!values[key]) {
      throw OAuthErrors.installParseError(`OAuth admin-unblock output is missing '${key}'.`);
    }
  }

  return {
    ok: true,
    bundleDeployed: true,
    bundleFile,
    command,
    companyId: values.companyId,
    companyWebId: values.companyWebId,
    userId: values.userId,
    userEmail: values.userEmail,
    passwordReset: values.passwordReset === 'true',
    rawOutput,
  };
}

export function formatOAuthAdminUnblock(result: OAuthAdminUnblockResult): string {
  return [
    `Admin user unblocked via ${result.command}`,
    `Company: ${result.companyId} (${result.companyWebId})`,
    `User: ${result.userId} (${result.userEmail})`,
    `passwordReset=${String(result.passwordReset)}`,
    `Bundle: ${result.bundleFile}`,
  ].join('\n');
}

function buildAdminUnblockGogoCommand(companyId?: number, userId?: number): string {
  if (companyId && userId) {
    return `ldev:adminUnblock ${companyId} ${userId}`;
  }

  if (companyId) {
    return `ldev:adminUnblock ${companyId}`;
  }

  return 'ldev:adminUnblock';
}
