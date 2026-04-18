export const OAuthErrorCode = {
  LOCAL_PROFILE_NOT_FOUND: 'OAUTH_LOCAL_PROFILE_NOT_FOUND',
  INSTALL_PARSE_ERROR: 'OAUTH_INSTALL_PARSE_ERROR',
} as const;

export type OAuthErrorCode = (typeof OAuthErrorCode)[keyof typeof OAuthErrorCode];
