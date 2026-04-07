import {CliError, normalizeCliError} from '../core/errors.js';
import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';

export type CliErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
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

export {CliError, normalizeCliError};
