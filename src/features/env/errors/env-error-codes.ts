export const EnvErrorCode = {
  CAPABILITY_MISSING: 'ENV_CAPABILITY_MISSING',
  CLEAN_FAILED: 'ENV_CLEAN_FAILED',
  FORCE_REQUIRED: 'ENV_FORCE_REQUIRED',
  START_TIMEOUT: 'ENV_START_TIMEOUT',
  START_FAILED: 'ENV_START_FAILED',
} as const;

export type EnvErrorCode = (typeof EnvErrorCode)[keyof typeof EnvErrorCode];
