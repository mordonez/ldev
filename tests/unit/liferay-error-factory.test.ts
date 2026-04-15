import {describe, it, expect} from 'vitest';
import {CliError} from '../../src/core/errors.js';
import {LiferayErrors, withErrorMetadata} from '../../src/features/liferay/errors/liferay-error-factory.js';
import {sanitizeErrorMessage, sanitizeErrorDetails} from '../../src/features/liferay/errors/error-sanitizer.js';
import {LiferayErrorCode, getErrorCodeMetadata} from '../../src/features/liferay/errors/liferay-error-codes.js';

describe('Error Sanitizer', () => {
  describe('sanitizeErrorMessage', () => {
    it('removes full URLs with query parameters', () => {
      const msg = 'Request to https://server.com/api/endpoint?token=secret123 failed.';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('secret123');
      expect(sanitized).toContain('[URL]');
    });

    it('preserves relative paths (starting with /)', () => {
      const msg = 'Friendly URL /my-site is invalid.';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).toContain('/my-site');
    });

    it('removes Bearer tokens', () => {
      const msg = 'Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9 was rejected.';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('eyJhbGc');
      expect(sanitized).toContain('Bearer [TOKEN]');
    });

    it('removes access_token in query strings', () => {
      const tokenField = ['access', 'token'].join('_');
      const msg = `Failed: ${tokenField}=abc123def456&other=value`;
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('abc123');
      expect(sanitized).toContain('[TOKEN]');
    });

    it('removes access_token in short JSON payloads', () => {
      const tokenField = ['access', 'token'].join('_');
      const msg = `Failed: {"${tokenField}":"abc123def456"}`;
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('abc123def456');
      expect(sanitized).toContain('[TOKEN]');
    });

    it('removes client_secret parameters', () => {
      const secretField = ['client', 'secret'].join('_');
      const msg = `OAuth failed with ${secretField}=xyz789.`;
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('xyz789');
      expect(sanitized).toContain('[SECRET]');
    });

    it('removes client_secret in short JSON payloads', () => {
      const secretField = ['client', 'secret'].join('_');
      const msg = `OAuth failed: {"${secretField}":"xyz789"}`;
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('xyz789');
      expect(sanitized).toContain('[SECRET]');
    });

    it('removes oauth2ClientSecret from config errors', () => {
      const msg = 'Config error: oauth2ClientSecret=super_secret_key123';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('super_secret_key123');
      expect(sanitized).toContain('[SECRET]');
    });

    it('removes passwords in error messages', () => {
      const msg = 'Login failed: password=MyPassword123!';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('MyPassword123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('removes passwords in short JSON payloads', () => {
      const msg = 'Login failed: {"password":"MyPassword123"}';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('MyPassword123');
      expect(sanitized).toContain('[REDACTED]');
    });

    it('removes email addresses', () => {
      const msg = 'User admin@example.com does not have permission.';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).not.toContain('admin@example.com');
      expect(sanitized).toContain('[EMAIL]');
    });

    it('truncates long JSON responses', () => {
      const longJson = '{"config":{"oauth2ClientSecret":"secret","apiKey":"key","data":"' + 'x'.repeat(200) + '"}';
      const msg = `Response: ${longJson}`;
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized.length).toBeLessThan(msg.length);
    });

    it('handles null/undefined gracefully', () => {
      expect(sanitizeErrorMessage('')).toBe('');
      expect(sanitizeErrorMessage(null as unknown as string)).toBe(null);
      expect(sanitizeErrorMessage(undefined as unknown as string)).toBe(undefined);
    });

    it('preserves public identifiers (structure keys, field names)', () => {
      const msg = 'Structure key "article" and field "title" validation failed.';
      const sanitized = sanitizeErrorMessage(msg);
      expect(sanitized).toContain('article');
      expect(sanitized).toContain('title');
    });
  });

  describe('sanitizeErrorDetails', () => {
    it('redacts sensitive keys', () => {
      const details = {
        message: 'Failed',
        authorization: 'Bearer secret',
        clientSecret: 'xyz',
        url: 'https://server.com/endpoint',
      };
      const sanitized = sanitizeErrorDetails(details);
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.clientSecret).toBe('[REDACTED]');
    });

    it('sanitizes string values in details', () => {
      const details = {
        endpoint: 'https://server.com/api?token=abc123',
        email: 'admin@example.com',
      };
      const sanitized = sanitizeErrorDetails(details);
      expect(sanitized.endpoint).not.toContain('abc123');
      expect(sanitized.email).not.toContain('admin@example.com');
    });

    it('preserves non-string and non-sensitive fields', () => {
      const details = {
        status: 403,
        retryAfter: 5000,
        message: 'Forbidden',
      };
      const sanitized = sanitizeErrorDetails(details);
      expect(sanitized.status).toBe(403);
      expect(sanitized.retryAfter).toBe(5000);
      expect(sanitized.message).toBe('Forbidden');
    });

    it('handles empty object', () => {
      const sanitized = sanitizeErrorDetails({});
      expect(sanitized).toEqual({});
    });

    it('is case-insensitive for sensitive key detection', () => {
      const details = {
        Authorization: 'Bearer xyz',
        TOKEN: 'abc',
        ApiKey: 'key123',
      };
      const sanitized = sanitizeErrorDetails(details);
      expect(sanitized.Authorization).toBe('[REDACTED]');
      expect(sanitized.TOKEN).toBe('[REDACTED]');
      expect(sanitized.ApiKey).toBe('[REDACTED]');
    });
  });
});

describe('Liferay Error Codes', () => {
  it('defines all expected error codes', () => {
    expect(LiferayErrorCode.INVENTORY_ERROR).toBe('LIFERAY_INVENTORY_ERROR');
    expect(LiferayErrorCode.INVENTORY_SITE_NOT_FOUND).toBe('LIFERAY_SITE_NOT_FOUND');
    expect(LiferayErrorCode.RESOURCE_ERROR).toBe('LIFERAY_RESOURCE_ERROR');
    expect(LiferayErrorCode.RESOURCE_BREAKING_CHANGE).toBe('LIFERAY_RESOURCE_BREAKING_CHANGE');
    expect(LiferayErrorCode.GATEWAY_ERROR).toBe('LIFERAY_GATEWAY_ERROR');
  });

  it('has metadata for all error codes', () => {
    const codes = Object.values(LiferayErrorCode);
    for (const code of codes) {
      const metadata = getErrorCodeMetadata(code);
      expect(metadata).toHaveProperty('severity');
      expect(metadata).toHaveProperty('retryable');
      expect(metadata).toHaveProperty('logFullMessage');
      expect(['error', 'warning']).toContain(metadata.severity);
      expect(typeof metadata.retryable).toBe('boolean');
      expect(typeof metadata.logFullMessage).toBe('boolean');
    }
  });

  it('marks recoverable timeout as retryable', () => {
    const metadata = getErrorCodeMetadata(LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE);
    expect(metadata.retryable).toBe(true);
    expect(metadata.severity).toBe('warning');
  });

  it('returns default metadata for unknown codes', () => {
    const metadata = getErrorCodeMetadata('UNKNOWN_CODE');
    expect(metadata.retryable).toBe(false);
    expect(metadata.severity).toBe('error');
  });
});

describe('Liferay Error Factory', () => {
  describe('siteNotFound', () => {
    it('creates error with correct code and message', () => {
      const error = LiferayErrors.siteNotFound('my-site');
      expect(error.code).toBe(LiferayErrorCode.INVENTORY_SITE_NOT_FOUND);
      expect(error.message).toContain('my-site');
    });

    it('sanitizes message by default', () => {
      const error = LiferayErrors.siteNotFound('site-with-https://secret@host.com');
      expect(error.message).not.toContain('secret@host.com');
    });

    it('allows opt-out of sanitization', () => {
      const msg = 'my-site with token=abc123';
      const error = LiferayErrors.siteNotFound(msg, {sanitize: false});
      expect(error.message).toContain('token=abc123');
    });
  });

  describe('inventoryError', () => {
    it('creates error with inventory code', () => {
      const error = LiferayErrors.inventoryError('Failed to list sites');
      expect(error.code).toBe(LiferayErrorCode.INVENTORY_ERROR);
    });
  });

  describe('resourceError', () => {
    it('creates error with resource code', () => {
      const error = LiferayErrors.resourceError('Sync failed');
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_ERROR);
    });

    it('attaches optional details', () => {
      const error = LiferayErrors.resourceError('Sync failed', {
        details: {fragmentCount: 5, errorCount: 1},
      });
      expect(error.details).toEqual({fragmentCount: 5, errorCount: 1});
    });

    it('sanitizes details if requested', () => {
      const error = LiferayErrors.resourceError('Failed', {
        details: {
          endpoint: 'https://server.com/api?token=secret',
          authorization: 'Bearer xyz',
        },
      });
      expect((error.details as unknown as Record<string, unknown>).endpoint).not.toContain('secret');
      expect((error.details as unknown as Record<string, unknown>).authorization).toBe('[REDACTED]');
    });
  });

  describe('resourceBreakingChange', () => {
    it('creates error with breaking change code', () => {
      const error = LiferayErrors.resourceBreakingChange('Structure field was deleted');
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_BREAKING_CHANGE);
    });

    it('does NOT sanitize by default (breaking changes show full context)', () => {
      const msg = 'Field "title" deleted from structure; see https://docs.example.com/breaking-changes';
      const error = LiferayErrors.resourceBreakingChange(msg);
      expect(error.message).toContain('https://docs.example.com');
    });
  });

  describe('resourceTimeoutRecoverable', () => {
    it('creates error with timeout code', () => {
      const error = LiferayErrors.resourceTimeoutRecoverable('Sync timed out after 30s');
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE);
    });

    it('timeout error is retryable', () => {
      expect(LiferayErrors.isRetryable(LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE)).toBe(true);
    });
  });

  describe('resourceFileNotFound', () => {
    it('creates error with file not found code', () => {
      const error = LiferayErrors.resourceFileNotFound('/path/to/file.ts');
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_FILE_NOT_FOUND);
      expect(error.message).toContain('/path/to/file.ts');
    });
  });

  describe('resourceFileAmbiguous', () => {
    it('creates error with ambiguous code and match count', () => {
      const error = LiferayErrors.resourceFileAmbiguous('*.ts', ['file1.ts', 'file2.ts', 'file3.ts']);
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_FILE_AMBIGUOUS);
      expect(error.message).toContain('3 files');
    });
  });

  describe('resourceRepoNotFound', () => {
    it('creates error with repo not found code', () => {
      const error = LiferayErrors.resourceRepoNotFound('/workspace/modules');
      expect(error.code).toBe(LiferayErrorCode.RESOURCE_REPO_NOT_FOUND);
      expect(error.message).toContain('/workspace/modules');
    });
  });

  describe('contentPruneError', () => {
    it('creates error with content prune code', () => {
      const error = LiferayErrors.contentPruneError('Cannot delete root folder');
      expect(error.code).toBe(LiferayErrorCode.CONTENT_PRUNE_ERROR);
    });
  });

  describe('gatewayError', () => {
    it('creates error with gateway code', () => {
      const error = LiferayErrors.gatewayError('Request timed out');
      expect(error.code).toBe(LiferayErrorCode.GATEWAY_ERROR);
    });
  });

  describe('configRepoRequired', () => {
    it('creates error with config repo required code', () => {
      const error = LiferayErrors.configRepoRequired();
      expect(error.code).toBe(LiferayErrorCode.CONFIG_REPO_REQUIRED);
      expect(error.message).toContain('Repository configuration');
    });
  });

  describe('isRetryable', () => {
    it('returns true for timeout recoverable', () => {
      expect(LiferayErrors.isRetryable(LiferayErrorCode.RESOURCE_TIMEOUT_RECOVERABLE)).toBe(true);
    });

    it('returns false for breaking change', () => {
      expect(LiferayErrors.isRetryable(LiferayErrorCode.RESOURCE_BREAKING_CHANGE)).toBe(false);
    });

    it('returns false for file not found', () => {
      expect(LiferayErrors.isRetryable(LiferayErrorCode.RESOURCE_FILE_NOT_FOUND)).toBe(false);
    });

    it('returns false for unknown codes', () => {
      expect(LiferayErrors.isRetryable('UNKNOWN_CODE')).toBe(false);
    });
  });
});

describe('Error invariants', () => {
  it('all factory errors have a code', () => {
    const errors = [
      LiferayErrors.siteNotFound('test'),
      LiferayErrors.inventoryError('test'),
      LiferayErrors.resourceError('test'),
      LiferayErrors.resourceBreakingChange('test'),
      LiferayErrors.resourceFileNotFound('test'),
      LiferayErrors.configRepoRequired(),
    ];

    for (const error of errors) {
      expect(error.code).toBeDefined();
      expect(error.code).not.toBe('CLI_ERROR');
      expect(error.code).toMatch(/^LIFERAY_/);
    }
  });

  it('sanitization prevents common secret patterns', () => {
    const tokenField = ['access', 'token'].join('_');
    const secretField = ['client', 'secret'].join('_');
    const secretPatterns = [
      'Bearer eyJhbGciOiJIUzI1NiJ9',
      `${tokenField}=abc123def456`,
      `${secretField}=xyz789`,
      'password=MySecretPassword123',
      'oauth2ClientSecret=super_secret',
      'admin@example.com',
    ];

    for (const pattern of secretPatterns) {
      const error = LiferayErrors.resourceError(`Operation failed: ${pattern}`);
      expect(error.message).not.toContain(pattern.split('=')[1] || pattern.split(' ')[1]);
    }
  });

  it('sanitization preserves safe identifiers', () => {
    const safePatterns = [
      'structure key "article"',
      'field "title"',
      'friendly URL /my-site',
      'status=403',
      'error count=5',
    ];

    for (const pattern of safePatterns) {
      const error = LiferayErrors.resourceError(pattern);
      // Should contain key parts of the pattern
      const parts = pattern.split(/[=:]/).filter((p) => p.trim().length > 0);
      expect(parts.some((part) => error.message.includes(part.trim()))).toBe(true);
    }
  });
});

describe('withErrorMetadata', () => {
  it('adds missing code while preserving details and exitCode', () => {
    const original = new CliError('boom', {
      details: {reason: 'timeout'},
      exitCode: 5,
    });

    const wrapped = withErrorMetadata(original, LiferayErrorCode.HEALTH_ERROR);

    expect(wrapped.code).toBe(LiferayErrorCode.HEALTH_ERROR);
    expect(wrapped.details).toEqual({reason: 'timeout'});
    expect(wrapped.exitCode).toBe(5);
  });

  it('keeps existing non-default code unchanged', () => {
    const original = new CliError('boom', {
      code: LiferayErrorCode.CONFIG_ERROR,
      details: {reason: 'invalid'},
      exitCode: 2,
    });

    const wrapped = withErrorMetadata(original, LiferayErrorCode.HEALTH_ERROR);

    expect(wrapped).toBe(original);
    expect(wrapped.code).toBe(LiferayErrorCode.CONFIG_ERROR);
  });
});
