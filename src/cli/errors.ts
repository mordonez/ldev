import {outputFormatSchema, type OutputFormat} from '../core/output/formats.js';

export class CliError extends Error {
  readonly code: string;
  readonly exitCode: number;
  readonly details?: unknown;

  constructor(message: string, options?: {code?: string; exitCode?: number; details?: unknown}) {
    super(message);
    this.name = 'CliError';
    this.code = options?.code ?? 'CLI_ERROR';
    this.exitCode = options?.exitCode ?? 1;
    this.details = options?.details;
  }
}

export function isCliError(error: unknown): error is CliError {
  return error instanceof CliError;
}

export type CliErrorPayload = {
  ok: false;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export function normalizeCliError(error: unknown): CliError {
  if (isCliError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return new CliError(message);
}

export function resolveOutputFormatFromArgv(argv: string[]): OutputFormat {
  for (let index = argv.length - 1; index >= 0; index -= 1) {
    const current = argv[index];
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
