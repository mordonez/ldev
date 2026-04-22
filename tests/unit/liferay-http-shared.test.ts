import {describe, expect, test} from 'vitest';

import type {AppConfig} from '../../src/core/config/load-config.js';
import type {HttpResponse} from '../../src/core/http/client.js';
import {CliError} from '../../src/core/errors.js';
import {buildAuthOptions, ensureData, expectJsonSuccess} from '../../src/features/liferay/liferay-http-shared.js';

const mockConfig: AppConfig = {
  cwd: '/repo',
  repoRoot: '/repo',
  dockerDir: null,
  liferayDir: null,
  files: {
    dockerEnv: null,
    liferayProfile: null,
  },
  liferay: {
    url: 'http://localhost:8080',
    timeoutSeconds: 30,
    oauth2ClientId: 'test-client',
    oauth2ClientSecret: 'test-secret',
    scopeAliases: 'default',
  },
};

describe('buildAuthOptions', () => {
  test('builds authorization header with Bearer token', () => {
    const options = buildAuthOptions(mockConfig, 'test-token');

    expect(options).toEqual({
      timeoutSeconds: 30,
      headers: {
        Authorization: 'Bearer test-token',
      },
    });
  });

  test('includes Accept-Language header when provided', () => {
    const options = buildAuthOptions(mockConfig, 'test-token', 'es-ES');

    expect(options).toEqual({
      timeoutSeconds: 30,
      headers: {
        Authorization: 'Bearer test-token',
        'Accept-Language': 'es-ES',
      },
    });
  });

  test('omits Accept-Language header when empty', () => {
    const options = buildAuthOptions(mockConfig, 'test-token', '');

    expect(options.headers).not.toHaveProperty('Accept-Language');
  });

  test('uses config timeoutSeconds', () => {
    const configWithTimeout = {
      ...mockConfig,
      liferay: {...mockConfig.liferay, timeoutSeconds: 60},
    };

    const options = buildAuthOptions(configWithTimeout, 'token');

    expect(options.timeoutSeconds).toBe(60);
  });
});

const mockHttpResponse = <T>(ok: boolean, status: number, data: T): HttpResponse<T> => ({
  ok,
  status,
  data,
  headers: new Headers(),
  body: JSON.stringify(data),
});

describe('expectJsonSuccess', () => {
  test('returns response when ok is true', () => {
    const response = mockHttpResponse(true, 200, {id: 123});

    const result = expectJsonSuccess(response, 'test-operation');

    expect(result).toBe(response);
  });

  test('throws CliError when ok is false', () => {
    const response = mockHttpResponse(false, 404, null);

    expect(() => expectJsonSuccess(response, 'test-operation')).toThrow(CliError);
  });

  test('includes status code in error message', () => {
    const response = mockHttpResponse(false, 500, null);

    expect(() => expectJsonSuccess(response, 'fetch-data')).toThrow(/status=500/);
  });

  test('includes operation label in error message', () => {
    const response = mockHttpResponse(false, 403, null);

    expect(() => expectJsonSuccess(response, 'delete-item')).toThrow(/delete-item/);
  });

  test('uses default error code when not provided', () => {
    const response = mockHttpResponse(false, 500, null);

    try {
      expectJsonSuccess(response, 'test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('LIFERAY_API_ERROR');
    }
  });

  test('uses custom error code when provided', () => {
    const response = mockHttpResponse(false, 404, null);

    try {
      expectJsonSuccess(response, 'test', 'CUSTOM_ERROR');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('CUSTOM_ERROR');
    }
  });

  test('handles 4xx status codes', () => {
    const response = mockHttpResponse(false, 400, null);

    expect(() => expectJsonSuccess(response, 'bad-request')).toThrow(/status=400/);
  });

  test('handles 5xx status codes', () => {
    const response = mockHttpResponse(false, 503, null);

    expect(() => expectJsonSuccess(response, 'service-unavailable')).toThrow(/status=503/);
  });
});

describe('ensureData', () => {
  test('returns data when not null or undefined', () => {
    const data = {id: 1, name: 'test'};

    const result = ensureData(data, 'user');

    expect(result).toBe(data);
  });

  test('throws CliError when data is null', () => {
    expect(() => {
      ensureData(null, 'template');
    }).toThrow(CliError);
  });

  test('throws CliError when data is undefined', () => {
    expect(() => {
      ensureData(undefined, 'structure');
    }).toThrow(CliError);
  });

  test('includes field name in error message', () => {
    expect(() => {
      ensureData(null, 'templateId');
    }).toThrow(/templateId/);
  });

  test('uses LIFERAY_API_ERROR code', () => {
    try {
      ensureData(null, 'test');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('LIFERAY_API_ERROR');
    }
  });

  test('uses custom error code when provided', () => {
    try {
      ensureData(null, 'test', 'LIFERAY_RESOURCE_ERROR');
      expect.fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(CliError);
      expect((error as CliError).code).toBe('LIFERAY_RESOURCE_ERROR');
    }
  });

  test('handles string data', () => {
    const result = ensureData('value', 'name');

    expect(result).toBe('value');
  });

  test('handles number data', () => {
    const result = ensureData(42, 'count');

    expect(result).toBe(42);
  });

  test('handles array data', () => {
    const array = [1, 2, 3];

    const result = ensureData(array, 'items');

    expect(result).toBe(array);
  });
});
