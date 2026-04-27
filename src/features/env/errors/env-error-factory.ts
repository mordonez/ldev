import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {EnvErrorCode} from './env-error-codes.js';

export const EnvErrors = {
  capabilityMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.CAPABILITY_MISSING, options),

  forceRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.FORCE_REQUIRED, options),

  startTimeout: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.START_TIMEOUT, options),
};
