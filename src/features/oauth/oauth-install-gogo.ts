import {setTimeout as delay} from 'node:timers/promises';

import {CliError} from '../../core/errors.js';
import type {AppConfig} from '../../core/config/load-config.js';
import {runGogoCommand} from '../osgi/osgi-shared.js';

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

export function buildOAuthInstallGogoCommand(companyId?: number, userId?: number, scopeAliases?: string[]): string {
  return buildGogoCommand(companyId, userId, scopeAliases);
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

function buildGogoCommand(companyId?: number, userId?: number, scopeAliases?: string[]): string {
  const serializedScopeAliases = scopeAliases && scopeAliases.length > 0 ? ` '${scopeAliases.join(',')}'` : '';

  if (companyId && userId) {
    return `ldev:oauthInstall ${companyId} ${userId}${serializedScopeAliases}`;
  }

  if (companyId) {
    return `ldev:oauthInstall ${companyId}${serializedScopeAliases}`;
  }

  if (serializedScopeAliases) {
    return `ldev:oauthInstall${serializedScopeAliases}`;
  }

  return 'ldev:oauthInstall';
}
