import type {BrowserLoginCredentials} from './browser-runner-types.js';

const DEFAULT_TEST_EMAIL = 'test@liferay.com';
const DEFAULT_TEST_PASSWORD = 'test';

export type ResolveVerifyLoginCredentialsInput = {
  email?: string;
  password?: string;
  env?: NodeJS.ProcessEnv;
};

/**
 * Resolves the login credentials used by `ldev verify page`.
 * Precedence: explicit CLI flag > environment variable > local Liferay default test user.
 */
export function resolveVerifyLoginCredentials(input: ResolveVerifyLoginCredentialsInput): BrowserLoginCredentials {
  const env = input.env ?? process.env;

  return {
    email: firstNonEmpty(input.email, env.LDEV_VERIFY_LOGIN_EMAIL, DEFAULT_TEST_EMAIL),
    password: firstNonEmpty(input.password, env.LDEV_VERIFY_LOGIN_PASSWORD, DEFAULT_TEST_PASSWORD),
  };
}

function firstNonEmpty(...values: (string | undefined)[]): string {
  for (const value of values) {
    if (value && value.trim() !== '') {
      return value.trim();
    }
  }
  return '';
}
