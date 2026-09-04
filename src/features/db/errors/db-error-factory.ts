import {createDomainError, type CliError, type DomainErrorOptions} from '../../../core/errors.js';
import {DbErrorCode} from './db-error-codes.js';

export const DbErrors = {
  backupNotFound: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DbErrorCode.BACKUP_NOT_FOUND, options),

  syncStateMissing: (message: string, options?: DomainErrorOptions): CliError =>
    createDomainError(message, DbErrorCode.SYNC_STATE_MISSING, options),
};
