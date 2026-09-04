export const DbErrorCode = {
  BACKUP_NOT_FOUND: 'DB_BACKUP_NOT_FOUND',
  SYNC_STATE_MISSING: 'DB_SYNC_STATE_MISSING',
} as const;

export type DbErrorCode = (typeof DbErrorCode)[keyof typeof DbErrorCode];
