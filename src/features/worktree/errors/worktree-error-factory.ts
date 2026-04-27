import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {WorktreeErrorCode} from './worktree-error-codes.js';

export const WorktreeErrors = {
  repoNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.REPO_NOT_FOUND, options),

  capabilityMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.CAPABILITY_MISSING, options),

  nameRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.NAME_REQUIRED, options),

  notFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.NOT_FOUND, options),

  notRegistered: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.NOT_REGISTERED, options),

  pathConflict: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.PATH_CONFLICT, options),

  forceRequired: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, WorktreeErrorCode.FORCE_REQUIRED, options),
};
