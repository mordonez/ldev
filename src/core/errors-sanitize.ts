/**
 * Error message sanitization to prevent leakage of secrets and sensitive data.
 *
 * Patterns removed:
 * - URLs with query parameters (may contain api keys, tokens)
 * - Bearer tokens and auth headers
 * - OAuth secrets and client credentials
 * - API endpoints with protocol/host
 * - Email addresses and full paths
 * - API response bodies that may contain nested secrets
 *
 * Patterns preserved:
 * - Generic error messages (e.g., "status=403")
 * - Field names and structure keys (safe identifiers)
 * - Site/group names (typically public)
 * - Friendly URLs (start with /; typically public)
 */

/**
 * Sanitize an error message to remove secrets and sensitive data.
 *
 * @param message Raw error message that may contain secrets
 * @returns Sanitized message safe for logging/display
 */
export function sanitizeErrorMessage(message: string): string;
export function sanitizeErrorMessage(message: null): null;
export function sanitizeErrorMessage(message: undefined): undefined;
export function sanitizeErrorMessage(message: string | null | undefined): string | null | undefined {
  if (message == null || message === '') {
    return message;
  }

  let sanitized = message;

  // Remove full URLs (but keep relative paths /site, /global)
  // Remove: https://server.com/path?key=secret
  sanitized = sanitized.replace(/https?:\/\/[^\s]+/gi, '[URL]');

  // Remove Bearer tokens in headers
  // Remove: Authorization: Bearer eyJhbGciOi...
  sanitized = sanitized.replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [TOKEN]');

  // Remove OAuth2 token fields in query-style and JSON-style payloads.
  sanitized = sanitized.replace(/["']?access(?:_|-)?token["']?\s*[:=]\s*["']?[^"',\s}&]+["']?/gi, '[TOKEN]');

  // Remove client secret fields in query-style and JSON-style payloads.
  sanitized = sanitized.replace(/["']?client(?:_|-)?secret["']?\s*[:=]\s*["']?[^"',\s}&]+["']?/gi, '[SECRET]');

  // Remove OAuth2 client secret fields from config/error messages.
  sanitized = sanitized.replace(
    /["']?oauth2(?:_|-)?client(?:_|-)?secret["']?\s*[:=]\s*["']?[^"',\s}&]+["']?/gi,
    '[SECRET]',
  );

  // Remove password fields in query-style and JSON-style payloads.
  sanitized = sanitized.replace(/["']?password["']?\s*[:=]\s*["']?[^"',\s}&]+["']?/gi, '[REDACTED]');

  // Remove full email addresses (keep domain generic if present)
  // Remove: user@example.com → user@[EMAIL]
  sanitized = sanitized.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+/g, '[EMAIL]');

  // Remove API response bodies that are too long (may contain nested secrets)
  // Keep short responses (< 200 chars) but truncate long ones
  const jsonMatch = sanitized.match(/\{.*\}|\[.*\]/s);
  if (jsonMatch && jsonMatch[0].length > 200) {
    sanitized = sanitized.replace(jsonMatch[0], '[JSON_RESPONSE]');
  }

  return sanitized;
}

/**
 * Optionally redact sensitive context from error details.
 * Use for --json/--ndjson output in strict mode.
 *
 * @param details Object that may contain sensitive fields
 * @returns Shallow copy with sensitive fields redacted
 */
export function sanitizeErrorDetails(details: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'authorization',
    'bearer',
    'token',
    'accessToken',
    'refreshToken',
    'clientSecret',
    'oauth2ClientSecret',
    'password',
    'secret',
    'credentials',
    'apiKey',
    'apiSecret',
  ];

  const redacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive.toLowerCase()))) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      redacted[key] = sanitizeErrorMessage(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}
