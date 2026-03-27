import type {Command} from 'commander';

import {createCommandContext, type CommandContext} from './command-context.js';
import type {OutputFormat} from '../core/output/formats.js';

const OUTPUT_FORMAT_OPTION_DESCRIPTION = 'Output format: text, json, ndjson';

export function addOutputFormatOption(command: Command, defaultFormat: OutputFormat = 'text'): Command {
  return command.option('--format <format>', OUTPUT_FORMAT_OPTION_DESCRIPTION, defaultFormat);
}

export function renderCommandResult<TResult>(
  context: CommandContext,
  result: TResult,
  options?: {
    text?: string | ((result: TResult) => string);
    json?: unknown | ((result: TResult) => unknown);
    exitCode?: number | ((result: TResult) => number | undefined);
  },
): void {
  if (context.printer.format === 'text') {
    const text = typeof options?.text === 'function' ? options.text(result) : options?.text;
    context.printer.write(text ?? result);
  } else {
    const json = typeof options?.json === 'function' ? options.json(result) : options?.json;
    context.printer.write(json ?? result);
  }

  const exitCode = typeof options?.exitCode === 'function' ? options.exitCode(result) : options?.exitCode;
  if (exitCode !== undefined) {
    process.exitCode = exitCode;
  }
}

export async function withCommandContext<TOptions extends object>(
  options: TOptions,
  run: (context: CommandContext) => Promise<void>,
): Promise<void> {
  const context = createCommandContext({format: (options as {format?: string}).format});
  await run(context);
}

export function createFormattedAction<TOptions extends object, TResult>(
  run: (context: CommandContext, options: TOptions) => Promise<TResult>,
  renderOptions?:
  | {
    text?: string | ((result: TResult) => string);
    json?: unknown | ((result: TResult) => unknown);
    exitCode?: number | ((result: TResult) => number | undefined);
  }
  | ((options: TOptions) => {
    text?: string | ((result: TResult) => string);
    json?: unknown | ((result: TResult) => unknown);
    exitCode?: number | ((result: TResult) => number | undefined);
  }),
): (options: TOptions) => Promise<void> {
  return async (options) => withCommandContext(options, async (context) => {
    const result = await run(context, options);
    renderCommandResult(context, result, typeof renderOptions === 'function' ? renderOptions(options) : renderOptions);
  });
}

export function createFormattedArgumentAction<TArg, TOptions extends object, TResult>(
  run: (context: CommandContext, argument: TArg, options: TOptions) => Promise<TResult>,
  renderOptions?:
  | {
    text?: string | ((result: TResult) => string);
    json?: unknown | ((result: TResult) => unknown);
    exitCode?: number | ((result: TResult) => number | undefined);
  }
  | ((options: TOptions) => {
    text?: string | ((result: TResult) => string);
    json?: unknown | ((result: TResult) => unknown);
    exitCode?: number | ((result: TResult) => number | undefined);
  }),
): (argument: TArg, options: TOptions) => Promise<void> {
  return async (argument, options) => withCommandContext(options, async (context) => {
    const result = await run(context, argument, options);
    renderCommandResult(context, result, typeof renderOptions === 'function' ? renderOptions(options) : renderOptions);
  });
}
