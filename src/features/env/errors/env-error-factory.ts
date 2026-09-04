import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {EnvErrorCode} from './env-error-codes.js';

export const EnvErrors = {
  capabilityMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.CAPABILITY_MISSING, options),

  cleanFailed: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.CLEAN_FAILED, options),

  forceRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.FORCE_REQUIRED, options),

  startTimeout: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.START_TIMEOUT, options),

  startFailed: (message: string, options?: DomainErrorOptions): CliError => {
    const isPostgresDependencyFailure = /\bpostgres\b.*\bunhealthy\b/i.test(message);
    const remedy = isPostgresDependencyFailure
      ? "Run 'ldev env clean', then retry. If postgres is still unhealthy, set POSTGRES_DATA_MODE=volume in docker/.env."
      : "Run 'ldev env clean', then retry 'ldev start'.";

    return createDomainError(`${message}\n\n${remedy}`, EnvErrorCode.START_FAILED, options);
  },
};
