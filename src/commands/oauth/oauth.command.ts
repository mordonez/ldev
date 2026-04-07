import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {CliError} from '../../core/errors.js';
import {formatOAuthAdminUnblock, runOAuthAdminUnblock} from '../../features/oauth/oauth-admin-unblock.js';
import {formatOAuthInstall, runOAuthInstall} from '../../features/oauth/oauth-install.js';
import {resolveOAuthScopeProfileNames, type OAuthScopeProfileName} from '../../features/oauth/oauth-scope-aliases.js';

export function createOAuthCommand(): Command {
  const command = new Command('oauth');

  command.description('Install and persist the OAuth2 app used by ldev').addHelpText(
    'after',
    `
Recommended flow:
  1. ldev start
  2. ldev oauth install --write-env

This command deploys the bundled OAuth installer bundle if needed, invokes it
through the supported runtime path for the current project type, and can
persist the resulting credentials into .liferay-cli.local.yml.
`,
  );

  addOutputFormatOption(
    command
      .command('install')
      .helpGroup('Recommended commands:')
      .description('Create or update the ldev OAuth2 app in the running portal')
      .option('--company-id <id>', 'Use a specific company ID')
      .option('--user-id <id>', 'Use a specific user ID')
      .option('--scope <alias>', 'Add an OAuth2 scope alias (repeatable)', collectScopeOptionValues, [])
      .option(
        '--scope-profile <name>',
        `Add a named OAuth2 scope profile: ${resolveOAuthScopeProfileNames().join(', ')}`,
        collectScopeProfileOptionValues,
        [],
      )
      .option('--write-env', 'Persist read-write OAuth2 credentials into .liferay-cli.local.yml'),
  ).action(
    createFormattedAction(
      async (
        context,
        options: {
          companyId?: string;
          userId?: string;
          writeEnv?: boolean;
          scope?: string[];
          scopeProfile?: OAuthScopeProfileName[];
        },
      ) => {
        const companyId = parseOptionalId(options.companyId, '--company-id');
        const userId = parseOptionalId(options.userId, '--user-id');

        if (userId && !companyId) {
          throw new CliError('--user-id requires --company-id.', {code: 'OAUTH_INSTALL_OPTION_INVALID'});
        }

        return runOAuthInstall(context.config, {
          companyId,
          userId,
          writeEnv: Boolean(options.writeEnv),
          extraScopeAliases: options.scope ?? [],
          extraScopeProfiles: options.scopeProfile ?? [],
          printer: context.printer,
        });
      },
      {text: formatOAuthInstall},
    ),
  );

  addOutputFormatOption(
    command
      .command('admin-unblock')
      .helpGroup('Recommended commands:')
      .description('Clear the initial password-reset state for the selected admin user')
      .option('--company-id <id>', 'Use a specific company ID')
      .option('--user-id <id>', 'Use a specific user ID'),
  ).action(
    createFormattedAction(
      async (context, options: {companyId?: string; userId?: string}) => {
        const companyId = parseOptionalId(options.companyId, '--company-id');
        const userId = parseOptionalId(options.userId, '--user-id');

        if (userId && !companyId) {
          throw new CliError('--user-id requires --company-id.', {code: 'OAUTH_INSTALL_OPTION_INVALID'});
        }

        return runOAuthAdminUnblock(context.config, {
          companyId,
          userId,
          printer: context.printer,
        });
      },
      {text: formatOAuthAdminUnblock},
    ),
  );

  return command;
}

function parseOptionalId(rawValue: string | undefined, optionName: string): number | undefined {
  if (!rawValue) {
    return undefined;
  }

  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new CliError(`${optionName} must be a positive integer.`, {code: 'OAUTH_INSTALL_OPTION_INVALID'});
  }

  return parsed;
}

function collectScopeOptionValues(value: string, previous: string[]): string[] {
  for (const part of value.split(',')) {
    const normalized = part.trim();

    if (normalized !== '') {
      previous.push(normalized);
    }
  }

  return previous;
}

function collectScopeProfileOptionValues(value: string, previous: OAuthScopeProfileName[]): OAuthScopeProfileName[] {
  const validProfiles = new Set(resolveOAuthScopeProfileNames());

  for (const part of value.split(',')) {
    const normalized = part.trim();

    if (normalized === '') {
      continue;
    }

    if (!validProfiles.has(normalized as OAuthScopeProfileName)) {
      throw new CliError(`--scope-profile must be one of: ${resolveOAuthScopeProfileNames().join(', ')}.`, {
        code: 'OAUTH_INSTALL_OPTION_INVALID',
      });
    }

    previous.push(normalized as OAuthScopeProfileName);
  }

  return previous;
}
