import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {OAuthErrorCode} from './oauth-error-codes.js';

export const OAuthErrors = {
  localProfileNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, OAuthErrorCode.LOCAL_PROFILE_NOT_FOUND, options),

  installParseError: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, OAuthErrorCode.INSTALL_PARSE_ERROR, options),
};
