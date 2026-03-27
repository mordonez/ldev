import {loadConfig, type AppConfig} from '../core/config/load-config.js';
import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';
import {createPrinter, type Printer} from '../core/output/print.js';

export type CommandContext = {
  cwd: string;
  config: AppConfig;
  printer: Printer;
};

export function createCommandContext(options?: {cwd?: string; format?: string}): CommandContext {
  const cwd = process.env.REPO_ROOT?.trim() || options?.cwd || process.cwd();
  const config = loadConfig({cwd, env: process.env});
  const format = outputFormatSchema.parse(options?.format ?? 'text') as OutputFormat;

  return {
    cwd,
    config,
    printer: createPrinter(format),
  };
}
