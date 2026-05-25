import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';
import {resolveDeployModuleTarget} from '../../src/features/deploy/deploy-module-resolver.js';

describe('resolveDeployModuleTarget', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('ldev-deploy-module-resolver-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  function makeContext(liferayDir: string) {
    return {
      repoRoot: path.dirname(liferayDir),
      liferayDir,
      dockerDir: path.join(path.dirname(liferayDir), 'docker'),
      gradlewPath: path.join(liferayDir, 'gradlew'),
      buildDir: path.join(liferayDir, 'build', 'docker'),
      buildDeployDir: path.join(liferayDir, 'build', 'docker', 'deploy'),
    };
  }

  test('resolves a nested module by leaf directory name', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const moduleDir = path.join(liferayDir, 'modules', 'ub-fitxes-utils', 'ub-fitxes-utils-api');
    await fs.ensureDir(moduleDir);
    await fs.writeFile(path.join(moduleDir, 'build.gradle'), '');

    const target = await resolveDeployModuleTarget(makeContext(liferayDir), 'ub-fitxes-utils-api');

    expect(target.gradleTasks).toEqual([
      [':modules:ub-fitxes-utils:ub-fitxes-utils-api:dockerDeploy', '-Pliferay.workspace.environment=dockerenv'],
    ]);
    expect(target.artifactDirs).toEqual([path.join(moduleDir, 'build', 'libs')]);
  });

  test('resolves a nested module by relative path from liferay root', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const moduleDir = path.join(liferayDir, 'modules', 'ub-fitxes-utils', 'ub-fitxes-utils-service');
    await fs.ensureDir(moduleDir);
    await fs.writeFile(path.join(moduleDir, 'build.gradle'), '');

    const target = await resolveDeployModuleTarget(
      makeContext(liferayDir),
      'modules/ub-fitxes-utils/ub-fitxes-utils-service',
    );

    expect(target.gradleTasks[0][0]).toBe(':modules:ub-fitxes-utils:ub-fitxes-utils-service:dockerDeploy');
    expect(target.artifactDirs).toEqual([path.join(moduleDir, 'build', 'libs')]);
  });

  test('resolves a module by Bundle-SymbolicName from bnd.bnd', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const moduleDir = path.join(liferayDir, 'modules', 'ub-fitxes-utils', 'ub-fitxes-utils-service');
    await fs.ensureDir(moduleDir);
    await fs.writeFile(path.join(moduleDir, 'build.gradle'), '');
    await fs.writeFile(path.join(moduleDir, 'bnd.bnd'), 'Bundle-SymbolicName: es.ricoh.ub.fitxes.utils.impl\n');

    const target = await resolveDeployModuleTarget(makeContext(liferayDir), 'es.ricoh.ub.fitxes.utils.impl');

    expect(target.moduleDir).toBe(moduleDir);
    expect(target.gradleTasks[0][0]).toBe(':modules:ub-fitxes-utils:ub-fitxes-utils-service:dockerDeploy');
  });
});
