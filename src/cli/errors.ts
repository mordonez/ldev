import {CommanderError} from 'commander';

import {CliError, normalizeCliError as normalizeCoreError} from '../core/errors.js';
import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';

export type CliErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export type CliSuccessPayload<T = unknown> = {
  ok: true;
  data: T;
};

export function resolveOutputFormatFromArgv(argv: string[]): OutputFormat {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const current = argv[index];
    if (current === '--json') {
      return 'json';
    }

    if (current === '--ndjson') {
      return 'ndjson';
    }

    if (current === '--format') {
      const parsed = outputFormatSchema.safeParse(argv[index + 1]);
      if (parsed.success) {
        return parsed.data;
      }
      break;
    }

    if (current.startsWith('--format=')) {
      const parsed = outputFormatSchema.safeParse(current.slice('--format='.length));
      if (parsed.success) {
        return parsed.data;
      }
      break;
    }
  }

  return 'text';
}

export function toCliErrorPayload(error: CliError): CliErrorPayload {
  return {
    ok: false,
    error: {
      code: error.code,
      message: error.message,
      ...(error.details === undefined ? {} : {details: error.details}),
    },
  };
}

export function toCliSuccessPayload<T = unknown>(data: T): CliSuccessPayload<T> {
  return {
    ok: true,
    data,
  };
}

/** Exit code for invalid invocations (unknown command or option, missing argument). */
export const USAGE_ERROR_EXIT_CODE = 2;

/**
 * Normalize anything thrown during a CLI run into a CliError.
 * Commander usage failures become `CLI_USAGE_ERROR` with exit code 2; help and version keep exit code 0.
 */
export function normalizeCliError(error: unknown): CliError {
  if (error instanceof CommanderError) {
    return new CliError(error.message.replace(/^error:\s*/i, ''), {
      code: 'CLI_USAGE_ERROR',
      exitCode: error.exitCode === 0 ? 0 : USAGE_ERROR_EXIT_CODE,
    });
  }
  return normalizeCoreError(error);
}

export {CliError};
