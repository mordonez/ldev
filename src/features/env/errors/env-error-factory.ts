import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {EnvErrorCode} from './env-error-codes.js';

export const EnvErrors = {
  capabilityMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.CAPABILITY_MISSING, options),

  forceRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.FORCE_REQUIRED, options),

  startTimeout: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.START_TIMEOUT, options),

  startFailed: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(
      `${message}\n\nIf a previous 'ldev start' was interrupted mid-boot, the bind-mounted runtime data can be left half-initialized (e.g. postgres never finishing its first-run setup). Run 'ldev env clean' to reset local runtime data, then retry 'ldev start'.`,
      EnvErrorCode.START_FAILED,
      options,
    ),
};
