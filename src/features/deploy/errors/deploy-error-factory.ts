import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {DeployErrorCode} from './deploy-error-codes.js';

export const DeployErrors = {
  moduleRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DeployErrorCode.MODULE_REQUIRED, options),

  moduleNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DeployErrorCode.MODULE_NOT_FOUND, options),

  gradleError: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DeployErrorCode.GRADLE_ERROR, options),

  artifactsNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DeployErrorCode.ARTIFACTS_NOT_FOUND, options),

  workspaceRootNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DeployErrorCode.WORKSPACE_ROOT_NOT_FOUND, options),
};
