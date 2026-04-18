export const DbErrorCode = {
  SYNC_STATE_MISSING: 'DB_SYNC_STATE_MISSING',
} as const;

export type DbErrorCode = (typeof DbErrorCode)[keyof typeof DbErrorCode];
