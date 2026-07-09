import {describe, expect, test} from 'vitest';

import {resolveVerifyLoginCredentials} from '../../src/features/verify/verify-login-credentials.js';

describe('resolveVerifyLoginCredentials', () => {
  test('falls back to the default local Liferay test user', () => {
    const credentials = resolveVerifyLoginCredentials({env: {}});

    expect(credentials).toEqual({email: 'test@liferay.com', password: 'test'});
  });

  test('prefers environment variables over defaults', () => {
    const credentials = resolveVerifyLoginCredentials({
      env: {LDEV_VERIFY_LOGIN_EMAIL: 'env@example.com', LDEV_VERIFY_LOGIN_PASSWORD: 'env-pass'},
    });

    expect(credentials).toEqual({email: 'env@example.com', password: 'env-pass'});
  });

  test('prefers explicit values over environment variables and defaults', () => {
    const credentials = resolveVerifyLoginCredentials({
      email: 'flag@example.com',
      password: 'flag-pass',
      env: {LDEV_VERIFY_LOGIN_EMAIL: 'env@example.com', LDEV_VERIFY_LOGIN_PASSWORD: 'env-pass'},
    });

    expect(credentials).toEqual({email: 'flag@example.com', password: 'flag-pass'});
  });

  test('ignores blank explicit values', () => {
    const credentials = resolveVerifyLoginCredentials({email: '   ', password: '', env: {}});

    expect(credentials).toEqual({email: 'test@liferay.com', password: 'test'});
  });
});
