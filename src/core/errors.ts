import {sanitizeErrorDetails, sanitizeErrorMessage} from './errors-sanitize.js';

export type DomainErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

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

export function normalizeCliError(error: unknown): CliError {
  if (isCliError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : 'Unknown error';
  return new CliError(message);
}

export function createDomainError(message: string, code: string, options?: DomainErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}
