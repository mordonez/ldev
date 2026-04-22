import fs from 'fs-extra';
import path from 'node:path';

import {vi} from 'vitest';

import type {OAuthTokenClient, TokenResponse} from '../core/http/auth.js';
import type {FetchLike} from '../core/http/client.js';

import {createTempDir} from './temp-repo.js';

export function parseTestJson<T>(body: string): T {
  return JSON.parse(body) as T;
}

export function createTestJsonResponse(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data), {status: 200, ...init});
}

export function createTestPageResponse<T>(items: T[], lastPage = 1, init?: ResponseInit): Response {
  return createTestJsonResponse({items, lastPage}, init);
}

export function toTestRequestUrl(input: string | URL | Request): string {
  if (typeof input === 'string') {
    return input;
  }

  if (input instanceof URL) {
    return input.toString();
  }

  return input.url;
}

export function toTestRequestBody(body: unknown): string {
  if (typeof body === 'string') {
    return body;
  }

  if (body instanceof URLSearchParams) {
    return body.toString();
  }

  if (body === undefined || body === null) {
    return '';
  }

  throw new TypeError('Unsupported test request body type');
}

export function createTestFetchImpl(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): FetchLike {
  return ((input: string | URL | Request, init?: RequestInit) =>
    Promise.resolve(handler(toTestRequestUrl(input), init))) as FetchLike;
}

export function createStaticTokenClient(overrides?: Partial<TokenResponse>): OAuthTokenClient {
  const token: TokenResponse = {
    accessToken: overrides?.accessToken ?? 'token-123',
    tokenType: overrides?.tokenType ?? 'Bearer',
    expiresIn: overrides?.expiresIn ?? 3600,
  };

  return {
    fetchClientCredentialsToken: () => Promise.resolve(token),
  };
}

export function createTokenClient(factory: () => TokenResponse | Promise<TokenResponse>): OAuthTokenClient {
  return {
    fetchClientCredentialsToken: () => Promise.resolve(factory()),
  };
}

export async function createLiferayCliRepoFixture(prefix: string): Promise<string> {
  const repoRoot = createTempDir(prefix);
  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'LIFERAY_CLI_URL=http://localhost:8080\nLIFERAY_CLI_OAUTH2_CLIENT_ID=client-id\nLIFERAY_CLI_OAUTH2_CLIENT_SECRET=client-secret\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');

  return repoRoot;
}

export function captureProcessOutput(): {
  stdout: () => string;
  stderr: () => string;
  restore: () => void;
} {
  let stdout = '';
  let stderr = '';

  const stdoutSpy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stdout += String(chunk);
    return true;
  });
  const stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk: string | Uint8Array) => {
    stderr += String(chunk);
    return true;
  });

  return {
    stdout: () => stdout,
    stderr: () => stderr,
    restore: () => {
      stdoutSpy.mockRestore();
      stderrSpy.mockRestore();
    },
  };
}
