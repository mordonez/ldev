import type {Command} from 'commander';

import type {CommandContext} from '../../cli/command-context.js';
import {addOutputFormatOption, createFormattedAction, type RenderOptions} from '../../cli/command-helpers.js';
import type {OutputFormat} from '../../core/output/formats.js';
import {LiferayErrors} from '../../features/liferay/errors/index.js';

export type ResourceCommandOptionBag = {
  adt?: string | string[];
  allSites?: boolean;
  allowBreakingChange?: boolean;
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
  apply?: boolean;
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
