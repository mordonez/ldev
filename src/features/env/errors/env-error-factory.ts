import {CliError} from '../../../core/errors.js';
import {sanitizeErrorDetails, sanitizeErrorMessage} from '../../../core/errors-sanitize.js';
import {EnvErrorCode} from './env-error-codes.js';

type EnvErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

function createEnvError(message: string, code: EnvErrorCode, options?: EnvErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

export const EnvErrors = {
  capabilityMissing: (message: string, options?: EnvErrorOptions): CliError =>
    createEnvError(message, EnvErrorCode.CAPABILITY_MISSING, options),

  forceRequired: (message: string, options?: EnvErrorOptions): CliError =>
    createEnvError(message, EnvErrorCode.FORCE_REQUIRED, options),

  startTimeout: (message: string, options?: EnvErrorOptions): CliError =>
    createEnvError(message, EnvErrorCode.START_TIMEOUT, options),
};
