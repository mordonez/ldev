/**
 * Liferay errors module: unified, sanitized error creation.
 *
 * Exports:
 * - LiferayErrors: factory helpers for domain-specific errors
 * - LiferayErrorCode: enumeration of all error codes
 * - sanitizeErrorMessage: message sanitizer (prevents secret leakage)
 */

export {LiferayErrors, withErrorMetadata, type LiferayErrorOptions} from './liferay-error-factory.js';
export {LiferayErrorCode, getErrorCodeMetadata} from './liferay-error-codes.js';
export {sanitizeErrorMessage, sanitizeErrorDetails} from '../../../core/errors-sanitize.js';
