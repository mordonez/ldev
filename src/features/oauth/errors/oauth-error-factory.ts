import {CliError} from '../../../core/errors.js';
import {sanitizeErrorDetails, sanitizeErrorMessage} from '../../../core/errors-sanitize.js';
import {OAuthErrorCode} from './oauth-error-codes.js';

type OAuthErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

function createOAuthError(message: string, code: OAuthErrorCode, options?: OAuthErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

export const OAuthErrors = {
  localProfileNotFound: (message: string, options?: OAuthErrorOptions): CliError =>
    createOAuthError(message, OAuthErrorCode.LOCAL_PROFILE_NOT_FOUND, options),

  installParseError: (message: string, options?: OAuthErrorOptions): CliError =>
    createOAuthError(message, OAuthErrorCode.INSTALL_PARSE_ERROR, options),
};
