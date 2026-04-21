import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {createFakeDockerBin} from '../../src/testing/fake-docker.js';
import {parseTestJson} from '../../src/testing/cli-test-helpers.js';
import {createTempDir} from '../../src/testing/temp-repo.js';
import {runCli} from '../../src/testing/cli-entry.js';

type OAuthVerification = {
  attempted: boolean;
  verified: boolean;
  sanitized?: boolean;
};

type OAuthInstallPayload = {
  command: string;
  companyId: string;
  userId?: string;
  passwordReset?: boolean;
  localProfileUpdated?: boolean;
  readWrite: {
    clientId: string;
  };
  scopeAliases: string[];
  verification: OAuthVerification;
  bundleFile: string;
};

describe('oauth integration', () => {
  test('oauth install deploys the bundled installer and writes local profile credentials', async () => {
    const repoRoot = await createOAuthRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(
      ['oauth', 'install', '--scope', 'custom.scope.everything.read', '--write-env', '--format', 'json'],
      {
        cwd: repoRoot,
        env,
      },
    );

    expect(result.exitCode).toBe(0);

    const parsed = parseTestJson<OAuthInstallPayload>(result.stdout);
    expect(parsed.command).toBe('ldev:oauthInstall');
    expect(parsed.companyId).toBe('20116');
    expect(parsed.readWrite.clientId).toBe('client-id');
    expect(parsed.scopeAliases).toContain('custom.scope.everything.read');
    expect(parsed.localProfileUpdated).toBe(true);
    expect(parsed.verification.attempted).toBe(false);
    expect(parsed.verification.verified).toBe(true);

    const localProfile = await fs.readFile(path.join(repoRoot, '.liferay-cli.local.yml'), 'utf8');
    expect(localProfile).toContain('clientId: client-id');
    expect(localProfile).toContain('clientSecret: client-secret');
    expect(localProfile).toContain('scopeAliases:');
    expect(localProfile).toContain('custom.scope.everything.read');
    expect(await fs.pathExists(path.join(repoRoot, 'liferay', 'build', 'docker', 'deploy'))).toBe(true);
    expect(parsed.bundleFile).toContain('dev.mordonez.ldev.oauth2.app-1.0.0.jar');
  }, 45000);

  test('oauth admin-unblock clears the password-reset state for the selected admin user', async () => {
    const repoRoot = await createOAuthRepoFixture();
    const fakeBinDir = await createFakeDockerBin();
    const env = {...process.env, PATH: `${fakeBinDir}:${process.env.PATH ?? ''}`};

    const result = await runCli(['oauth', 'admin-unblock', '--format', 'json'], {
      cwd: repoRoot,
      env,
    });

    expect(result.exitCode).toBe(0);

    const parsed = parseTestJson<OAuthInstallPayload>(result.stdout);
    expect(parsed.companyId).toBe('20116');
    expect(parsed.userId).toBe('20123');
    expect(parsed.passwordReset).toBe(false);
    expect(parsed.bundleFile).toContain('dev.mordonez.ldev.oauth2.app-1.0.0.jar');
  }, 45000);
});

async function createOAuthRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-oauth-');

  await fs.ensureDir(path.join(repoRoot, 'docker'));
  await fs.ensureDir(path.join(repoRoot, 'liferay'));
  await fs.writeFile(path.join(repoRoot, 'docker', 'docker-compose.yml'), 'services:\n  liferay:\n');
  await fs.writeFile(
    path.join(repoRoot, 'docker', '.env'),
    'COMPOSE_PROJECT_NAME=demo\nBIND_IP=127.0.0.1\nLIFERAY_HTTP_PORT=8080\n',
  );
  await fs.writeFile(path.join(repoRoot, 'liferay', 'build.gradle'), 'plugins {}\n');

  return repoRoot;
}
