/**
 * Liferay error factory: unified, typed error creation with optional sanitization.
 *
 * Provides domain-specific helpers (siteNotFound, resourceError, etc.)
 * with consistent structure, sanitized messages, and metadata.
 *
 * Usage:
 *   throw LiferayErrors.siteNotFound('my-site');
 *   throw LiferayErrors.resourceError('Could not sync fragment');
 */

import {CliError} from '../../../core/errors.js';
import {sanitizeErrorMessage, sanitizeErrorDetails} from './error-sanitizer.js';
import {LiferayErrorCode, getErrorCodeMetadata} from './liferay-error-codes.js';

/**
 * Options for error creation.
 */
export type LiferayErrorOptions = {
  /** Sanitize message and details (default: true) */
  sanitize?: boolean;

  /** Additional context to attach to error */
  details?: Record<string, unknown>;
};

/**
 * Create a CliError with Liferay error code and optional sanitization.
 *
 * @param message User-facing error message
 * @param code Liferay error code (from LiferayErrorCode enum)
 * @param options Sanitization and context options
 */
function createLiferayError(message: string, code: LiferayErrorCode, options?: LiferayErrorOptions): CliError {
  const sanitize = options?.sanitize !== false;
  const finalMessage = sanitize ? sanitizeErrorMessage(message) : message;
  const finalDetails = options?.details
    ? sanitize
      ? sanitizeErrorDetails(options.details)
      : options.details
    : undefined;

  return new CliError(finalMessage, {code, details: finalDetails});
}

/**
 * Liferay domain-specific error factory helpers.
 * Each helper returns a CliError typed with the corresponding error code.
 */
export const LiferayErrors = {
  /**
   * Site resolution failed: site not found in any fallback strategy.
   */
  siteNotFound: (site: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(`Site not found: ${site}.`, LiferayErrorCode.INVENTORY_SITE_NOT_FOUND, options),

  /**
   * Generic inventory operation failed.
   */
  inventoryError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.INVENTORY_ERROR, options),

  /**
   * Generic resource operation failed (sync, import, export).
   */
  resourceError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.RESOURCE_ERROR, options),

  /**
   * Resource operation encountered a breaking change.
   * Indicates operation cannot proceed and manual intervention may be required.
   */
  resourceBreakingChange: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.RESOURCE_BREAKING_CHANGE, {
      ...options,
      sanitize: false, // Breaking changes should show full context
    }),

  /**
   * Resource operation timed out but may be recoverable (e.g., with --retry).
   */
  resourceTimeoutRecoverable: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE, options),

  /**
   * Resource file not found in local filesystem.
   */
  resourceFileNotFound: (filePath: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(`Resource file not found: ${filePath}.`, LiferayErrorCode.RESOURCE_FILE_NOT_FOUND, options),

  /**
   * Resource file path is ambiguous (multiple matches).
   */
  resourceFileAmbiguous: (pattern: string, matches: string[], options?: LiferayErrorOptions): CliError =>
    createLiferayError(
      `Ambiguous resource file: ${pattern} matches ${matches.length} files.`,
      LiferayErrorCode.RESOURCE_FILE_AMBIGUOUS,
      options,
    ),

  /**
   * Resource repository not found.
   */
  resourceRepoNotFound: (repoPath: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(
      `Resource repository not found: ${repoPath}.`,
      LiferayErrorCode.RESOURCE_REPO_NOT_FOUND,
      options,
    ),

  /**
   * Content prune operation failed.
   */
  contentPruneError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.CONTENT_PRUNE_ERROR, options),

  /**
   * Content stats collection failed.
   */
  contentStatsError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.CONTENT_STATS_ERROR, options),

  /**
   * Journal transport operation failed (folder traversal, article fetch, folder fetch).
   */
  contentJournalError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.CONTENT_JOURNAL_ERROR, options),

  /**
   * HTTP gateway operation failed.
   */
  gatewayError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.GATEWAY_ERROR, options),

  /**
   * MCP endpoint could not be reached or discovered.
   */
  mcpEndpointNotFound: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_ENDPOINT_NOT_FOUND, options),

  /**
   * MCP initialize request returned a non-ok HTTP status.
   */
  mcpInitializeFailed: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_INITIALIZE_FAILED, options),

  /**
   * MCP initialize succeeded but did not return a session id.
   */
  mcpInitializeSessionIdMissing: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_INITIALIZE_SESSION_ID_MISSING, options),

  /**
   * MCP initialize returned a response shape that does not match the expected protocol payload.
   */
  mcpInitializeInvalidPayload: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_INITIALIZE_INVALID_PAYLOAD, options),

  /**
   * MCP request failed.
   */
  mcpRequestFailed: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_REQUEST_FAILED, options),

  /**
   * MCP notification failed.
   */
  mcpNotificationFailed: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_NOTIFICATION_FAILED, options),

  /**
   * MCP response could not be parsed as JSON or SSE-framed JSON.
   */
  mcpParseError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.MCP_PARSE_ERROR, options),

  /**
   * Configuration error.
   */
  configError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.CONFIG_ERROR, options),

  /**
   * Repository configuration required but not found.
   */
  configRepoRequired: (options?: LiferayErrorOptions): CliError =>
    createLiferayError(
      'Repository configuration required (.liferay-cli.yml with repositoryPath or REPO_ROOT env var).',
      LiferayErrorCode.CONFIG_REPO_REQUIRED,
      options,
    ),

  /**
   * Health check failed.
   */
  healthError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.HEALTH_ERROR, options),

  /**
   * Theme operations failed.
   */
  themeError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.THEME_ERROR, options),

  /**
   * Page layout operations failed.
   */
  pageLayoutError: (message: string, options?: LiferayErrorOptions): CliError =>
    createLiferayError(message, LiferayErrorCode.PAGE_LAYOUT_ERROR, options),

  /**
   * Convert a code string to metadata and check if retryable.
   */
  isRetryable: (code: string): boolean => {
    const metadata = getErrorCodeMetadata(code);
    return metadata.retryable;
  },
};

/**
 * Backward-compatible helper to wrap existing CliError instances with metadata.
 * Does NOT modify the original error; returns it as-is.
 * Use only to add type safety to existing error handling.
 */
export function withErrorMetadata<T extends CliError>(error: T, code: LiferayErrorCode): T {
  // Ensure error has a code property
  if (!error.code || error.code === 'CLI_ERROR') {
    // Re-create error with code when missing, preserving existing details and exit behavior.
    const newError = new CliError(error.message, {
      code,
      details: error.details,
      exitCode: error.exitCode,
    });
    newError.stack = error.stack;
    return newError as T;
  }
  return error;
}
