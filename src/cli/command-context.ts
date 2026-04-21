import {type AppConfig} from '../core/config/load-config.js';
import {resolveProjectContext, type ProjectContext} from '../core/config/project-context.js';
import {CliError} from '../core/errors.js';
import {resolveOutputFormatFromArgv} from './errors.js';
import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';
import {createPrinter, type Printer} from '../core/output/printer.js';

export type CommandContext = {
  cwd: string;
  config: AppConfig;
  project: ProjectContext;
  printer: Printer;
  strict: boolean;
};

type CommandContextOptions = {
  cwd?: string;
  format?: string;
  strict?: boolean;
  json?: boolean;
  ndjson?: boolean;
  liferayUrl?: string;
  liferayClientId?: string;
  liferayClientSecret?: string;
  liferayClientSecretEnv?: string;
  liferayScopeAliases?: string;
  liferayTimeoutSeconds?: string | number;
};

type LiferayConnectionOverrides = {
  url?: string;
  oauth2ClientId?: string;
  oauth2ClientSecret?: string;
  scopeAliases?: string;
  timeoutSeconds?: number;
};

export function createCommandContext(options?: CommandContextOptions): CommandContext {
  const cwd = process.env.REPO_ROOT?.trim() || options?.cwd || process.cwd();
  const project = resolveProjectContext({cwd, env: process.env});
  const overrides = resolveLiferayConnectionOverrides(options, process.argv, process.env);
  const config = applyLiferayConnectionOverrides(project.config, overrides);
  const resolvedFormat = resolveOutputFormatOption(options);
  const format = outputFormatSchema.parse(resolvedFormat);
  const strict = resolveStrictMode(options);

  return {
    cwd,
    config,
    project,
    printer: createPrinter(format),
    strict,
  };
}

function resolveStrictMode(options?: {strict?: boolean}): boolean {
  if (options?.strict !== undefined) {
    return options.strict;
  }

  // Check for --strict in argv
  return process.argv.includes('--strict');
}

function resolveOutputFormatOption(options?: {format?: string; json?: boolean; ndjson?: boolean}): OutputFormat {
  if (options?.ndjson) {
    return 'ndjson';
  }

  if (options?.json) {
    return 'json';
  }

  if (options?.format && options.format !== 'text') {
    return options.format as OutputFormat;
  }

  return resolveOutputFormatFromArgv(process.argv);
}

function resolveLiferayConnectionOverrides(
  options: CommandContextOptions | undefined,
  argv: string[],
  env: NodeJS.ProcessEnv,
): LiferayConnectionOverrides {
  const url = resolveStringOverride(options?.liferayUrl, '--liferay-url', argv);
  const oauth2ClientId = resolveStringOverride(options?.liferayClientId, '--liferay-client-id', argv);
  const scopeAliases = resolveStringOverride(options?.liferayScopeAliases, '--liferay-scope-aliases', argv);
  const timeoutSeconds = resolveTimeoutOverride(options?.liferayTimeoutSeconds, '--liferay-timeout-seconds', argv);

  const cliSecret = resolveStringOverride(options?.liferayClientSecret, '--liferay-client-secret', argv);
  const secretEnvName = resolveStringOverride(options?.liferayClientSecretEnv, '--liferay-client-secret-env', argv);
  const oauth2ClientSecret = resolveSecretOverride(cliSecret, secretEnvName, env);

  return {
    ...(url ? {url} : {}),
    ...(oauth2ClientId ? {oauth2ClientId} : {}),
    ...(oauth2ClientSecret ? {oauth2ClientSecret} : {}),
    ...(scopeAliases ? {scopeAliases} : {}),
    ...(timeoutSeconds !== undefined ? {timeoutSeconds} : {}),
  };
}

function resolveStringOverride(optionValue: unknown, flag: string, argv: string[]): string {
  const fromOptions = typeof optionValue === 'string' ? optionValue.trim() : '';
  if (fromOptions !== '') {
    return validateStringOverride(fromOptions, flag);
  }

  return validateStringOverride(findArgvOptionValue(argv, flag), flag);
}

function resolveTimeoutOverride(optionValue: unknown, flag: string, argv: string[]): number | undefined {
  let candidate = '';
  if (typeof optionValue === 'number' && Number.isFinite(optionValue)) {
    candidate = String(optionValue);
  } else if (typeof optionValue === 'string') {
    candidate = optionValue.trim();
  }
  if (candidate === '') {
    candidate = findArgvOptionValue(argv, flag);
  }

  if (candidate === '') {
    return undefined;
  }

  if (!/^\d+$/.test(candidate)) {
    throw new CliError('--liferay-timeout-seconds must be a positive integer.', {
      code: 'LIFERAY_CONFIG_INCOMPLETE',
    });
  }

  const parsed = Number.parseInt(candidate, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new CliError('--liferay-timeout-seconds must be a positive integer.', {
      code: 'LIFERAY_CONFIG_INCOMPLETE',
    });
  }

  return parsed;
}

function resolveSecretOverride(cliSecret: string, secretEnvName: string, env: NodeJS.ProcessEnv): string {
  if (cliSecret !== '') {
    return cliSecret;
  }

  if (secretEnvName === '') {
    return '';
  }

  const secret = env[secretEnvName]?.trim() ?? '';
  if (secret === '') {
    throw new CliError(
      `--liferay-client-secret-env points to '${secretEnvName}' but that environment variable is empty or missing.`,
      {
        code: 'LIFERAY_CONFIG_INCOMPLETE',
      },
    );
  }

  return secret;
}

function validateStringOverride(value: string, flag: string): string {
  if (value === '') {
    return value;
  }

  if (flag === '--liferay-url') {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        throw new Error('invalid protocol');
      }
    } catch {
      throw new CliError('--liferay-url must be a valid http(s) URL.', {
        code: 'LIFERAY_CONFIG_INCOMPLETE',
      });
    }
  }

  return value;
}

function findArgvOptionValue(argv: string[], flag: string): string {
  for (let i = argv.length - 1; i >= 0; i -= 1) {
    const current = argv[i];
    if (current === flag) {
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        return next.trim();
      }
      throw new CliError(`${flag} requires a value.`, {
        code: 'LIFERAY_CONFIG_INCOMPLETE',
      });
    }

    const prefix = `${flag}=`;
    if (current.startsWith(prefix)) {
      const value = current.slice(prefix.length).trim();
      if (value === '') {
        throw new CliError(`${flag} requires a value.`, {
          code: 'LIFERAY_CONFIG_INCOMPLETE',
        });
      }

      return value;
    }
  }

  return '';
}

function applyLiferayConnectionOverrides(config: AppConfig, overrides: LiferayConnectionOverrides): AppConfig {
  if (Object.keys(overrides).length === 0) {
    return config;
  }

  return {
    ...config,
    liferay: {
      ...config.liferay,
      ...overrides,
    },
  };
}
