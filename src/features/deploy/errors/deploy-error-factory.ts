import {CliError} from '../../../core/errors.js';
import {sanitizeErrorDetails, sanitizeErrorMessage} from '../../../core/errors-sanitize.js';
import {DeployErrorCode} from './deploy-error-codes.js';

type DeployErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

function createDeployError(message: string, code: DeployErrorCode, options?: DeployErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

export const DeployErrors = {
  moduleRequired: (message: string, options?: DeployErrorOptions): CliError =>
    createDeployError(message, DeployErrorCode.MODULE_REQUIRED, options),

  moduleNotFound: (message: string, options?: DeployErrorOptions): CliError =>
    createDeployError(message, DeployErrorCode.MODULE_NOT_FOUND, options),

  gradleError: (message: string, options?: DeployErrorOptions): CliError =>
    createDeployError(message, DeployErrorCode.GRADLE_ERROR, options),

  artifactsNotFound: (message: string, options?: DeployErrorOptions): CliError =>
    createDeployError(message, DeployErrorCode.ARTIFACTS_NOT_FOUND, options),

  workspaceRootNotFound: (message: string, options?: DeployErrorOptions): CliError =>
    createDeployError(message, DeployErrorCode.WORKSPACE_ROOT_NOT_FOUND, options),
};
