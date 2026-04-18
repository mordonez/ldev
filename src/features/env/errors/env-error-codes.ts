export const EnvErrorCode = {
  CAPABILITY_MISSING: 'ENV_CAPABILITY_MISSING',
  FORCE_REQUIRED: 'ENV_FORCE_REQUIRED',
  START_TIMEOUT: 'ENV_START_TIMEOUT',
} as const;

export type EnvErrorCode = (typeof EnvErrorCode)[keyof typeof EnvErrorCode];
