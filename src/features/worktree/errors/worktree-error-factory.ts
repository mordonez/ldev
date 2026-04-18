import {CliError} from '../../../core/errors.js';
import {sanitizeErrorDetails, sanitizeErrorMessage} from '../../../core/errors-sanitize.js';
import {WorktreeErrorCode} from './worktree-error-codes.js';

type WorktreeErrorOptions = {
  sanitize?: boolean;
  details?: Record<string, unknown>;
};

function createWorktreeError(message: string, code: WorktreeErrorCode, options?: WorktreeErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

export const WorktreeErrors = {
  repoNotFound: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.REPO_NOT_FOUND, options),

  capabilityMissing: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.CAPABILITY_MISSING, options),

  nameRequired: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.NAME_REQUIRED, options),

  notFound: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.NOT_FOUND, options),

  notRegistered: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.NOT_REGISTERED, options),

  pathConflict: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.PATH_CONFLICT, options),

  forceRequired: (message: string, options?: WorktreeErrorOptions): CliError =>
    createWorktreeError(message, WorktreeErrorCode.FORCE_REQUIRED, options),
};
