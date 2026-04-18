import {CliError} from '../../../core/errors.js';
import {sanitizeErrorDetails, sanitizeErrorMessage} from '../../../core/errors-sanitize.js';
import {DbErrorCode} from './db-error-codes.js';

type DbErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

function createDbError(message: string, code: DbErrorCode, options?: DbErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

export const DbErrors = {
  syncStateMissing: (message: string, options?: DbErrorOptions): CliError =>
    createDbError(message, DbErrorCode.SYNC_STATE_MISSING, options),
};
