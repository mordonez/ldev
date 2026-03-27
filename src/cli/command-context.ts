import {loadConfig, type AppConfig} from '../core/config/load-config.js';
import {resolveProjectContext, type ProjectContext} from '../core/config/project-context.js';
import {resolveOutputFormatFromArgv} from './errors.js';
import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';
import {createPrinter, type Printer} from '../core/output/print.js';

export type CommandContext = {
  cwd: string;
  config: AppConfig;
  project: ProjectContext;
  printer: Printer;
};

export function createCommandContext(options?: {cwd?: string; format?: string}): CommandContext {
  const cwd = process.env.REPO_ROOT?.trim() || options?.cwd || process.cwd();
  const project = resolveProjectContext({cwd, env: process.env});
  const config = project.config;
  const resolvedFormat = resolveOutputFormatOption(options);
  const format = outputFormatSchema.parse(resolvedFormat) as OutputFormat;

  return {
    cwd,
    config,
    project,
    printer: createPrinter(format),
  };
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
