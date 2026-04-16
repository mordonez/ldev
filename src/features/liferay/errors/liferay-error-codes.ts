/**
 * Liferay feature error codes.
 * Unified enumeration of all error codes used across inventory, resource, and content features.
 *
 * Naming convention: LIFERAY_<FEATURE>_<SPECIFIC>
 * - FEATURE: INVENTORY, RESOURCE, CONTENT, GATEWAY, HEALTH, CONFIG, etc.
 * - SPECIFIC: description of the error
 */

export enum LiferayErrorCode {
  // Inventory errors
  INVENTORY_ERROR = 'LIFERAY_INVENTORY_ERROR',
  INVENTORY_SITE_NOT_FOUND = 'LIFERAY_SITE_NOT_FOUND',

  // Resource errors (sync/import/export)
  RESOURCE_ERROR = 'LIFERAY_RESOURCE_ERROR',
  RESOURCE_BREAKING_CHANGE = 'LIFERAY_RESOURCE_BREAKING_CHANGE',
  RESOURCE_TIMEOUT_RECOVERABLE = 'LIFERAY_RESOURCE_TIMEOUT_RECOVERABLE',
  RESOURCE_FILE_NOT_FOUND = 'LIFERAY_RESOURCE_FILE_NOT_FOUND',
  RESOURCE_FILE_AMBIGUOUS = 'LIFERAY_RESOURCE_FILE_AMBIGUOUS',
  RESOURCE_REPO_NOT_FOUND = 'LIFERAY_REPO_NOT_FOUND',

  // Content errors
  CONTENT_PRUNE_ERROR = 'LIFERAY_CONTENT_PRUNE_ERROR',
  CONTENT_STATS_ERROR = 'LIFERAY_CONTENT_STATS_ERROR',

  // Gateway/HTTP errors
  GATEWAY_ERROR = 'LIFERAY_GATEWAY_ERROR',

  // MCP errors
  MCP_ENDPOINT_NOT_FOUND = 'LIFERAY_MCP_ENDPOINT_NOT_FOUND',
  MCP_INITIALIZE_FAILED = 'LIFERAY_MCP_INITIALIZE_FAILED',
  MCP_INITIALIZE_SESSION_ID_MISSING = 'LIFERAY_MCP_INITIALIZE_SESSION_ID_MISSING',
  MCP_INITIALIZE_INVALID_PAYLOAD = 'LIFERAY_MCP_INITIALIZE_INVALID_PAYLOAD',
  MCP_REQUEST_FAILED = 'LIFERAY_MCP_REQUEST_FAILED',
  MCP_NOTIFICATION_FAILED = 'LIFERAY_MCP_NOTIFICATION_FAILED',
  MCP_PARSE_ERROR = 'LIFERAY_MCP_PARSE_ERROR',

  // Configuration errors
  CONFIG_ERROR = 'LIFERAY_CONFIG_ERROR',
  CONFIG_REPO_REQUIRED = 'LIFERAY_CONFIG_REPO_REQUIRED',

  // Health check errors
  HEALTH_ERROR = 'LIFERAY_HEALTH_ERROR',

  // Theme/Page errors
  THEME_ERROR = 'LIFERAY_THEME_ERROR',
  PAGE_LAYOUT_ERROR = 'LIFERAY_PAGE_LAYOUT_ERROR',
}

/**
 * Error metadata: attributes of each error code.
 * Used for error handling strategy (retry, log level, etc.).
 */
export const errorCodeMetadata: Record<
  LiferayErrorCode,
  {
    severity: 'error' | 'warning';
    retryable: boolean;
    logFullMessage: boolean;
  }
> = {
  [LiferayErrorCode.INVENTORY_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.INVENTORY_SITE_NOT_FOUND]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.RESOURCE_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.RESOURCE_BREAKING_CHANGE]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE]: {severity: 'warning', retryable: true, logFullMessage: false},
  [LiferayErrorCode.RESOURCE_FILE_NOT_FOUND]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.RESOURCE_FILE_AMBIGUOUS]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.RESOURCE_REPO_NOT_FOUND]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.CONTENT_PRUNE_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.CONTENT_STATS_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.GATEWAY_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.MCP_ENDPOINT_NOT_FOUND]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.MCP_INITIALIZE_FAILED]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.MCP_INITIALIZE_SESSION_ID_MISSING]: {
    severity: 'error',
    retryable: false,
    logFullMessage: false,
  },
  [LiferayErrorCode.MCP_INITIALIZE_INVALID_PAYLOAD]: {
    severity: 'error',
    retryable: false,
    logFullMessage: false,
  },
  [LiferayErrorCode.MCP_REQUEST_FAILED]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.MCP_NOTIFICATION_FAILED]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.MCP_PARSE_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.CONFIG_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.CONFIG_REPO_REQUIRED]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.HEALTH_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},

  [LiferayErrorCode.THEME_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
  [LiferayErrorCode.PAGE_LAYOUT_ERROR]: {severity: 'error', retryable: false, logFullMessage: false},
};

/**
 * Get metadata for an error code.
 * Returns default metadata if code is unknown.
 */
export function getErrorCodeMetadata(code: string): {
  severity: 'error' | 'warning';
  retryable: boolean;
  logFullMessage: boolean;
} {
  const meta = errorCodeMetadata[code as LiferayErrorCode];
  if (meta) return meta;

  // Default: treat unknown codes as non-retryable errors
  return {severity: 'error', retryable: false, logFullMessage: false};
}
