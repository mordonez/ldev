import fs from 'fs-extra';
import path from 'node:path';

import {describe, expect, test} from 'vitest';

import {runProjectInit} from '../../src/features/project/project-init.js';
import {resolveProjectAssets} from '../../src/features/project/project-scaffold.js';
import {runProcess} from '../../src/core/platform/process.js';
import {createTempDir} from '../../src/testing/temp-repo.js';

const silentPrinter = {
  format: 'text' as const,
  write: () => undefined,
  error: () => undefined,
  info: () => undefined,
};

describe('project integration', () => {
  const GIT_ENV_KEYS = [
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
    'GIT_CONFIG_GLOBAL',
  ] as const;
  const savedGitEnv: Record<string, string | undefined> = {};

  function setupGitIdentityEnv(): void {
    for (const key of GIT_ENV_KEYS) {
      savedGitEnv[key] = process.env[key];
    }
    process.env.GIT_AUTHOR_NAME = 'Dev CLI Tests';
    process.env.GIT_AUTHOR_EMAIL = 'dev-cli-tests@example.com';
    process.env.GIT_COMMITTER_NAME = 'Dev CLI Tests';
    process.env.GIT_COMMITTER_EMAIL = 'dev-cli-tests@example.com';
    process.env.GIT_CONFIG_GLOBAL = '/dev/null';
  }

  function restoreGitIdentityEnv(): void {
    for (const key of GIT_ENV_KEYS) {
      if (savedGitEnv[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = savedGitEnv[key];
      }
    }
  }

  test('init scaffolds a new repository without requiring a vendor symlink', async () => {
    setupGitIdentityEnv();
    try {
      const repoRoot = await createProjectRepoFixture();
      const targetDir = createTempDir('dev-cli-project-init-');

      const result = await runProjectInit(
        {
          name: 'sample-project',
          targetDir,
          printer: silentPrinter,
        },
        {
          assets: resolveProjectAssets(repoRoot),
        },
      );

      expect(result.gitInitialized).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, '.git'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'docker', '.env'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'docker', 'sql', 'post-import.d', '.gitkeep'))).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, 'liferay', 'build.gradle'))).toBe(true);
      expect(
        await fs.pathExists(
          path.join(
            targetDir,
            'liferay',
            'configs',
            'common',
            'osgi',
            'configs',
            'com.liferay.dynamic.data.mapping.configuration.DDMWebConfiguration.config',
          ),
        ),
      ).toBe(true);
      expect(
        await fs.pathExists(
          path.join(
            targetDir,
            'liferay',
            'configs',
            'dockerenv',
            'osgi',
            'configs',
            'com.liferay.portal.store.file.system.configuration.AdvancedFileSystemStoreConfiguration.config',
          ),
        ),
      ).toBe(true);
      expect(await fs.pathExists(path.join(targetDir, '.liferay-cli.yml'))).toBe(true);
      expect(await fs.readFile(path.join(targetDir, '.liferay-cli.yml'), 'utf8')).not.toContain(
        'url: http://localhost:8080',
      );
      expect(await fs.pathExists(path.join(targetDir, 'vendor', 'liferay-tooling'))).toBe(false);
      expect(result.commitRequested).toBe(false);
      expect(result.changes.committed).toBe(false);
      expect(await gitStatus(targetDir)).not.toBe('');
    } finally {
      restoreGitIdentityEnv();
    }
  });

  test('init propagates BIND_IP from the host environment into docker/.env', async () => {
    setupGitIdentityEnv();
    const previousBindIp = process.env.BIND_IP;
    try {
      const repoRoot = await createProjectRepoFixture();
      const targetDir = createTempDir('dev-cli-project-init-bind-ip-');
      process.env.BIND_IP = '100.115.222.80';

      await runProjectInit(
        {
          name: 'sample-project',
          targetDir,
          printer: silentPrinter,
        },
        {
          assets: resolveProjectAssets(repoRoot),
        },
      );

      expect(await fs.readFile(path.join(targetDir, 'docker', '.env'), 'utf8')).toContain('BIND_IP=100.115.222.80');
    } finally {
      restoreGitIdentityEnv();
      if (previousBindIp === undefined) {
        delete process.env.BIND_IP;
      } else {
        process.env.BIND_IP = previousBindIp;
      }
    }
  });

  test('init can create an explicit bootstrap commit with --commit semantics', async () => {
    setupGitIdentityEnv();
    try {
      const repoRoot = await createProjectRepoFixture();
      const targetDir = createTempDir('dev-cli-project-init-commit-');

      const result = await runProjectInit(
        {
          name: 'sample-project',
          targetDir,
          printer: silentPrinter,
          commit: true,
        },
        {
          assets: resolveProjectAssets(repoRoot),
        },
      );

      expect(result.commitRequested).toBe(true);
      expect(result.changes.committed).toBe(true);
      expect(await gitStatus(targetDir)).toBe('');
      expect(await gitLogSubject(targetDir)).toBe('chore: scaffold initial Liferay project files');
    } finally {
      restoreGitIdentityEnv();
    }
  });
});

async function createProjectRepoFixture(): Promise<string> {
  const repoRoot = createTempDir('dev-cli-project-repo-');

  await fs.ensureDir(path.join(repoRoot, 'templates'));
  await fs.writeFile(
    path.join(repoRoot, 'templates', '.liferay-cli.yml'),
    'liferay:\n  oauth2:\n    clientId: ""\n    clientSecret: ""\n    timeoutSeconds: 30\n',
  );
  await fs.writeFile(path.join(repoRoot, 'templates', '.gitignore'), 'node_modules/\n');
  await fs.writeFile(path.join(repoRoot, 'templates', '.gitattributes'), '*.sh text eol=lf\n');

  const tpl = path.join(repoRoot, 'templates');

  await fs.ensureDir(path.join(tpl, 'docker'));
  await fs.writeFile(path.join(tpl, 'docker', '.env.example'), 'COMPOSE_PROJECT_NAME=test\n');
  await fs.writeFile(path.join(tpl, 'docker', '.env'), 'COMPOSE_PROJECT_NAME=ignored\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.yml'), 'services:\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.elasticsearch.yml'), 'services:\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.elasticsearch.volume.yml'), 'services:\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.postgres.yml'), 'services:\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.postgres.volume.yml'), 'services:\n');
  await fs.writeFile(path.join(tpl, 'docker', 'docker-compose.liferay.volume.yml'), 'services:\n');
  await fs.ensureDir(path.join(tpl, 'docker', 'elasticsearch'));
  await fs.writeFile(path.join(tpl, 'docker', 'elasticsearch', 'Dockerfile'), 'FROM elasticsearch:7.17.26\n');
  await fs.ensureDir(path.join(tpl, 'docker', 'liferay-configs-full'));
  await fs.writeFile(path.join(tpl, 'docker', 'liferay-configs-full', 'com.liferay.example.config'), 'enabled=true\n');
  await fs.ensureDir(path.join(tpl, 'docker', 'sql', 'post-import.d'));
  await fs.writeFile(path.join(tpl, 'docker', 'sql', 'post-import.d', '.gitkeep'), '');
  await fs.ensureDir(path.join(tpl, 'docker', 'liferay-scripts', 'pre-startup'));
  await fs.writeFile(
    path.join(tpl, 'docker', 'liferay-scripts', 'pre-startup', 'configure-session-cookie.sh'),
    '#!/bin/bash\n',
  );
  await fs.writeFile(
    path.join(tpl, 'docker', 'liferay-scripts', 'pre-startup', 'install-activation-key.sh'),
    '#!/bin/bash\n',
  );

  await fs.ensureDir(path.join(tpl, 'liferay', 'modules'));
  await fs.writeFile(path.join(tpl, 'liferay', '.gitignore'), '**/build\n');
  await fs.writeFile(path.join(tpl, 'liferay', 'build.gradle'), 'plugins {}\n');
  await fs.writeFile(path.join(tpl, 'liferay', 'gradle.properties'), 'liferay.workspace.product=dxp-2025.q1.0-lts\n');
  await fs.writeFile(path.join(tpl, 'liferay', 'settings.gradle'), 'rootProject.name = "sample"\n');
  await fs.writeFile(path.join(tpl, 'liferay', 'gradlew'), '#!/bin/sh\n');
  await fs.writeFile(path.join(tpl, 'liferay', 'gradlew.bat'), '@echo off\r\n');
  await fs.ensureDir(path.join(tpl, 'liferay', 'gradle', 'wrapper'));
  await fs.writeFile(path.join(tpl, 'liferay', 'gradle', 'wrapper', 'gradle-wrapper.jar'), 'jar');
  await fs.writeFile(
    path.join(tpl, 'liferay', 'gradle', 'wrapper', 'gradle-wrapper.properties'),
    'distributionUrl=https://example.invalid/gradle.zip\n',
  );
  await fs.ensureDir(path.join(tpl, 'liferay', 'configs', 'common', 'osgi', 'configs'));
  await fs.ensureDir(path.join(tpl, 'liferay', 'configs', 'dockerenv', 'osgi', 'configs'));
  await fs.writeFile(
    path.join(tpl, 'liferay', 'configs', 'dockerenv', 'portal-ext.properties'),
    'include-and-override=portal-developer.properties\n',
  );
  await fs.writeFile(
    path.join(tpl, 'liferay', 'configs', 'dockerenv', 'portal-setup-wizard.properties'),
    'setup.wizard.enabled=false\n',
  );
  await fs.writeFile(
    path.join(
      tpl,
      'liferay',
      'configs',
      'common',
      'osgi',
      'configs',
      'com.liferay.dynamic.data.mapping.configuration.DDMWebConfiguration.config',
    ),
    'autogenerateStructureKey=B"false"\n',
  );
  await fs.writeFile(
    path.join(
      tpl,
      'liferay',
      'configs',
      'common',
      'osgi',
      'configs',
      'com.liferay.fragment.configuration.FragmentServiceConfiguration.config',
    ),
    'enableConfiguration=B"false"\n',
  );
  await fs.writeFile(
    path.join(
      tpl,
      'liferay',
      'configs',
      'common',
      'osgi',
      'configs',
      'com.liferay.portal.template.freemarker.configuration.FreeMarkerEngineConfiguration.config',
    ),
    'localizedLookup=B"false"\n',
  );
  await fs.writeFile(
    path.join(
      tpl,
      'liferay',
      'configs',
      'dockerenv',
      'osgi',
      'configs',
      'com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config',
    ),
    'operationMode="REMOTE"\n',
  );
  await fs.writeFile(
    path.join(
      tpl,
      'liferay',
      'configs',
      'dockerenv',
      'osgi',
      'configs',
      'com.liferay.portal.store.file.system.configuration.AdvancedFileSystemStoreConfiguration.config',
    ),
    'rootDir="data/document_library"\n',
  );

  await fs.ensureDir(path.join(tpl, 'modules'));
  await fs.writeFile(path.join(tpl, 'modules', 'README.md'), '# bootstrap\n');
  await fs.writeFile(path.join(tpl, 'modules', 'bnd.bnd'), 'Bundle-Name: test\n');
  await fs.writeFile(path.join(tpl, 'modules', 'build.gradle'), 'dependencies {}\n');
  await fs.ensureDir(path.join(tpl, 'modules', 'src', 'main', 'java'));
  await fs.writeFile(path.join(tpl, 'modules', 'src', 'main', 'java', 'Test.java'), 'class Test {}\n');

  return repoRoot;
}

async function gitStatus(targetDir: string): Promise<string> {
  const result = await runProcess('git', ['status', '--short'], {cwd: targetDir});
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
}

async function gitLogSubject(targetDir: string): Promise<string> {
  const result = await runProcess('git', ['log', '-1', '--pretty=%s'], {cwd: targetDir});
  expect(result.exitCode).toBe(0);
  return result.stdout.trim();
}
