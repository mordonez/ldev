import {Command} from 'commander';

import type {CommandContext} from '../../cli/command-context.js';
import {createCommandContext} from '../../cli/command-context.js';
import {addOutputFormatOption, createFormattedAction, type RenderOptions} from '../../cli/command-helpers.js';
import type {OutputFormat} from '../../core/output/formats.js';
import {LiferayErrors} from '../../features/liferay/errors/index.js';
import {runLiferayPreflight} from '../../features/liferay/liferay-preflight.js';
import {registerResourceExportCommands} from './resource-export-commands.js';
import {registerResourceImportCommands} from './resource-import-commands.js';
import {registerResourceMigrationCommand} from './resource-migration-command.js';
import {registerResourceReadCommands} from './resource-read-commands.js';

// ── Types ─────────────────────────────────────────────────────────────────────

export type ResourceCommandOptionBag = {
  adt?: string | string[];
  allSites?: boolean;
  allowBreakingChange?: boolean;
  apply?: boolean;
  checkOnly?: boolean;
  className?: string;
  cleanupMigration?: boolean;
  collection?: string;
  continueOnError?: boolean;
  createMissing?: boolean;
  createMissingTemplates?: boolean;
  debug?: boolean;
  dir?: string;
  displayStyle?: string;
  file?: string;
  fragment?: string;
  id?: string;
  includeScript?: boolean;
  migrationDryRun?: boolean;
  migrationFile?: string;
  migrationPhase?: string;
  migrationPlan?: string;
  name?: string;
  out?: string | boolean;
  output?: string;
  overwrite?: boolean;
  pretty?: boolean;
  runCleanup?: boolean;
  site?: string;
  siteId?: string;
  skipUpdate?: boolean;
  skipValidation?: boolean;
  stage?: string;
  structure?: string | string[];
  template?: string | string[];
  templates?: boolean;
  widgetType?: string;
};

export type ResourceMigrationStage = 'introduce' | 'cleanup';

export type ResourceWorkflowSpec<TResult, TOptions extends ResourceCommandOptionBag = ResourceCommandOptionBag> = {
  name: string;
  description: string;
  defaultFormat?: OutputFormat;
  configure?: (command: Command) => Command;
  run: (context: CommandContext, options: TOptions) => Promise<TResult>;
  render?: RenderOptions<TResult>;
};

export type ResourceCommandOptions = {
  description: string;
  helpText: string;
  helpGroup?: string;
};

// ── Option presets ─────────────────────────────────────────────────────────────

type ConfigureFn = (cmd: Command) => Command;

export const o = {
  site:
    (dflt = '/global'): ConfigureFn =>
    (cmd) =>
      cmd.option('--site <site>', 'Site friendly URL or numeric ID', dflt),
  allSites:
    (description = 'Run for every accessible site'): ConfigureFn =>
    (cmd) =>
      cmd.option('--all-sites', description),
  checkOnly: (): ConfigureFn => (cmd) => cmd.option('--check-only', 'Preview only; do not update'),
  continueOnError:
    (subject: string): ConfigureFn =>
    (cmd) =>
      cmd.option('--continue-on-error', `Continue if one ${subject} entry fails`),
};

export function configure(...fns: ConfigureFn[]): ConfigureFn {
  return (cmd) => fns.reduce((c, fn) => fn(c), cmd);
}

// ── Registration helpers ───────────────────────────────────────────────────────

export function registerResourceWorkflow<TResult, TOptions extends ResourceCommandOptionBag = ResourceCommandOptionBag>(
  parent: Command,
  spec: ResourceWorkflowSpec<TResult, TOptions>,
): void {
  const command =
    spec.configure?.(parent.command(spec.name).description(spec.description)) ?? parent.command(spec.name);
  addOutputFormatOption(command, spec.defaultFormat ?? 'json').action(createFormattedAction(spec.run, spec.render));
}

export function collectRepeatableOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function requireResourceValue(value: string | undefined, message: string): string {
  if (value === undefined || value.trim() === '') {
    throw LiferayErrors.configError(message);
  }

  return value;
}

export function repeatableValues(value: string | string[] | undefined): string[] | undefined {
  return Array.isArray(value) ? value : value === undefined ? undefined : [value];
}

// ── Command factory ────────────────────────────────────────────────────────────

export function buildResourceCommand(options: ResourceCommandOptions): Command {
  const resource = new Command('resource')
    .description(options.description)
    .option('--liferay-url <url>', 'Override Liferay base URL for this command')
    .option('--liferay-client-id <clientId>', 'Override Liferay OAuth2 client id for this command')
    .option(
      '--liferay-client-secret <clientSecret>',
      'Override Liferay OAuth2 client secret for this command (less secure; prefer --liferay-client-secret-env)',
    )
    .option(
      '--liferay-client-secret-env <envVar>',
      'Read Liferay OAuth2 client secret from an environment variable (recommended)',
    )
    .option('--liferay-scope-aliases <aliases>', 'Override OAuth2 scope aliases (comma-separated) for this command')
    .option('--liferay-timeout-seconds <seconds>', 'Override Liferay HTTP timeout in seconds for this command')
    .option('--preflight', 'Run API surface preflight before executing resource subcommands')
    .addHelpText(
      'after',
      'Override precedence: --liferay-client-secret has priority over --liferay-client-secret-env.\n' +
        'Security tip: prefer --liferay-client-secret-env in local shells and CI to avoid exposing secrets in process args/history.\n\n' +
        options.helpText,
    );

  if (options.helpGroup) {
    resource.helpGroup(options.helpGroup);
  }

  resource.hook('preAction', async (_thisCommand, actionCommand) => {
    const opts = actionCommand.optsWithGlobals<{preflight?: boolean; format?: string; strict?: boolean}>();
    if (!opts.preflight) {
      return;
    }

    const context = createCommandContext(opts);
    await runLiferayPreflight(context.config);
  });

  registerResourceReadCommands(resource);
  registerResourceExportCommands(resource);
  registerResourceImportCommands(resource);
  registerResourceMigrationCommand(resource);

  return resource;
}

export function createResourceCommand(): Command {
  return buildResourceCommand({
    description: 'Export, import and migrate content resources',
    helpText: `
Use this namespace for file-based content workflows for structures, templates, ADTs or fragments.
It is intended for more specialized content workflows rather than first-run onboarding.

Read:
  structure, template, adts, adt, fragments

Export:
  export-structure, export-template, export-structures, export-templates, export-adt, export-adts, export-fragment, export-fragments

Import:
  import-structure, import-template, import-adt, import-fragment, import-fragments, import-structures, import-templates, import-adts

Migration:
  migration-init, migration-pipeline

Recommended:
  migration-pipeline for normal end-to-end migrations
`,
  });
}
