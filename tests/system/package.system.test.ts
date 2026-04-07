import path from 'node:path';
import {readFileSync} from 'node:fs';

import {describe, expect, test} from 'vitest';

import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const CLI_CWD = process.cwd();
const PACKAGE_JSON = JSON.parse(readFileSync(path.join(CLI_CWD, 'package.json'), 'utf8')) as {
  version: string;
};

function createPackageCommandEnv(): NodeJS.ProcessEnv {
  const env = {...process.env};

  delete env.npm_command;
  delete env.npm_lifecycle_event;
  delete env.npm_config_dry_run;
  delete env.NODE_OPTIONS;
  delete env.VITEST;
  delete env.VITEST_MODE;
  delete env.VITEST_POOL_ID;
  delete env.VITEST_WORKER_ID;
  delete env.__VITEST_POOL_ID__;
  delete env.__VITEST_WORKER_ID__;

  return env;
}

describe('package integration', () => {
  test('packed tarball includes scaffold dotfiles and project init works from the installed package', async () => {
    const npmEnv = createPackageCommandEnv();
    const packResult = await runProcess('npm', ['pack', '--json', '--ignore-scripts'], {cwd: CLI_CWD, env: npmEnv});
    expect(packResult.exitCode).toBe(0);

    const packJson = packResult.stdout.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/)?.[0];
    if (!packJson) {
      throw new Error(`Could not parse npm pack JSON output:\n${packResult.stdout}`);
    }
    const [{filename}] = JSON.parse(packJson) as Array<{filename: string}>;
    const tarballPath = path.join(CLI_CWD, filename);

    const listing = await runProcess('tar', ['-tzf', tarballPath], {cwd: CLI_CWD});
    expect(listing.exitCode).toBe(0);
    expect(listing.stdout).toContain('package/templates/docker/.env.example');
    expect(listing.stdout).toContain('package/templates/gitignore');
    expect(listing.stdout).toContain('package/templates/liferay/gitignore');

    const installDir = createTempDir('dev-cli-package-install-');
    const installResult = await runProcess('npm', ['install', '--no-package-lock', tarballPath], {
      cwd: installDir,
      env: npmEnv,
    });
    expect(installResult.exitCode).toBe(0);

    const installedCli = path.join(installDir, 'node_modules', '@mordonez', 'ldev', 'dist', 'index.js');
    const versionResult = await runProcess('node', [installedCli, '--version'], {cwd: installDir, env: npmEnv});
    expect(versionResult.exitCode).toBe(0);
    expect(versionResult.stdout.trim()).toBe(PACKAGE_JSON.version);

    const generatedProjectRoot = path.join(createTempDir('dev-cli-package-project-'), 'demo');
    const initResult = await runProcess(
      'node',
      [installedCli, 'project', 'init', '--name', 'demo', '--dir', generatedProjectRoot],
      {cwd: installDir, env: npmEnv},
    );
    expect(initResult.exitCode).toBe(0);
    expect(readFileSync(path.join(generatedProjectRoot, '.gitignore'), 'utf8')).toContain('node_modules');
    expect(readFileSync(path.join(generatedProjectRoot, 'docker', '.env'), 'utf8')).toContain('COMPOSE_PROJECT_NAME=');
    expect(readFileSync(path.join(generatedProjectRoot, 'liferay', '.gitignore'), 'utf8')).toContain('.gradle');
  }, 90000);
});
