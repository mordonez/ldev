import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {EnvErrorCode} from './env-error-codes.js';

export const EnvErrors = {
  capabilityMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.CAPABILITY_MISSING, options),

  forceRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.FORCE_REQUIRED, options),

  startTimeout: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, EnvErrorCode.START_TIMEOUT, options),

  startFailed: (message: string, options?: DomainErrorOptions): CliError => {
    const isPostgresDependencyFailure = /\bpostgres\b.*\bunhealthy\b/i.test(message);
    const remedy = isPostgresDependencyFailure
      ? "If a previous 'ldev start' was interrupted mid-boot, the bind-mounted runtime data can be left half-initialized. Run 'ldev env clean' to reset local runtime data, then retry 'ldev start'. If postgres still fails to become healthy on a clean start, Docker Desktop's bind-mount layer can leave a fresh postgres data directory with the wrong file ownership (visible in 'ldev logs' as \"FATAL: data directory ... has wrong ownership\"); add `POSTGRES_DATA_MODE=volume` to docker/.env to store postgres data in a named Docker volume instead, which does not hit this."
      : "If a previous 'ldev start' was interrupted mid-boot, the bind-mounted runtime data can be left half-initialized (e.g. postgres never finishing its first-run setup). Run 'ldev env clean' to reset local runtime data, then retry 'ldev start'.";

    return createDomainError(`${message}\n\n${remedy}`, EnvErrorCode.START_FAILED, options);
  },
};
