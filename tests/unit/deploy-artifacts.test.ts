import path from 'node:path';

import fs from 'fs-extra';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';

import {createTempDir} from '../../src/testing/temp-repo.js';
import {CliError} from '../../src/core/errors.js';
import {
  listDeployArtifacts,
  syncArtifactsToDirectory,
  uniquePaths,
  escapeSingleQuotes,
  escapeShellArg,
  ensureDeployArtifactsFound,
  collectModuleArtifacts,
} from '../../src/features/deploy/deploy-artifacts.js';

// ---------------------------------------------------------------------------
// uniquePaths — pure deduplication
// ---------------------------------------------------------------------------

describe('uniquePaths', () => {
  test('removes duplicate paths', () => {
    const result = uniquePaths(['/a/b.jar', '/a/b.jar', '/c/d.jar']);
    expect(result).toEqual(['/a/b.jar', '/c/d.jar']);
  });

  test('preserves order of first occurrence', () => {
    const result = uniquePaths(['/z.jar', '/a.jar', '/z.jar']);
    expect(result).toEqual(['/z.jar', '/a.jar']);
  });

  test('returns empty array for empty input', () => {
    expect(uniquePaths([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// escapeSingleQuotes — pure shell escaping
// ---------------------------------------------------------------------------

describe('escapeSingleQuotes', () => {
  test('returns value unchanged when no single quotes', () => {
    expect(escapeSingleQuotes('hello-world.jar')).toBe('hello-world.jar');
  });

  test('escapes a single quote', () => {
    expect(escapeSingleQuotes("it's")).toBe("it'\"'\"'s");
  });

  test('escapes multiple single quotes', () => {
    const result = escapeSingleQuotes("a'b'c");
    expect(result).toBe("a'\"'\"'b'\"'\"'c");
  });
});

// ---------------------------------------------------------------------------
// escapeShellArg — wraps in single quotes after escaping
// ---------------------------------------------------------------------------

describe('escapeShellArg', () => {
  test('wraps a plain value in single quotes', () => {
    expect(escapeShellArg('hello.jar')).toBe("'hello.jar'");
  });

  test('escapes and wraps a value with a space', () => {
    expect(escapeShellArg('my file.jar')).toBe("'my file.jar'");
  });

  test('escapes a single quote inside the value', () => {
    expect(escapeShellArg("it's.jar")).toBe("'it'\"'\"'s.jar'");
  });
});

// ---------------------------------------------------------------------------
// ensureDeployArtifactsFound — throws CliError when empty
// ---------------------------------------------------------------------------

describe('ensureDeployArtifactsFound', () => {
  test('does not throw when artifacts array is non-empty', () => {
    expect(() => {
      ensureDeployArtifactsFound(['/a/b.jar'], 'module-a');
    }).not.toThrow();
  });

  test('throws CliError with DEPLOY_ARTIFACTS_NOT_FOUND when empty', () => {
    expect(() => {
      ensureDeployArtifactsFound([], 'module-a');
    }).toThrow(CliError);
    try {
      ensureDeployArtifactsFound([], 'module-a');
    } catch (error) {
      expect((error as CliError).code).toBe('DEPLOY_ARTIFACTS_NOT_FOUND');
    }
  });

  test('includes the label in the error message', () => {
    try {
      ensureDeployArtifactsFound([], 'my-module');
    } catch (error) {
      expect((error as CliError).message).toContain('my-module');
    }
  });
});

// ---------------------------------------------------------------------------
// listDeployArtifacts — file system
// ---------------------------------------------------------------------------

describe('listDeployArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-artifacts-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('returns empty array when directory does not exist', async () => {
    const result = await listDeployArtifacts(path.join(tmpDir, 'absent'));
    expect(result).toEqual([]);
  });

  test('returns empty array for an empty directory', async () => {
    const dir = path.join(tmpDir, 'empty');
    await fs.ensureDir(dir);
    expect(await listDeployArtifacts(dir)).toEqual([]);
  });

  test('returns .jar files', async () => {
    const dir = path.join(tmpDir, 'jars');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'module-a.jar'), '');
    const result = await listDeployArtifacts(dir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('module-a.jar');
  });

  test('returns .war files', async () => {
    const dir = path.join(tmpDir, 'wars');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'theme.war'), '');
    const result = await listDeployArtifacts(dir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('theme.war');
  });

  test('returns .xml files', async () => {
    const dir = path.join(tmpDir, 'xmls');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'config.xml'), '');
    const result = await listDeployArtifacts(dir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('config.xml');
  });

  test('returns .zip files (client extension LUFFAs)', async () => {
    const dir = path.join(tmpDir, 'zips');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'my-client-ext.zip'), '');
    const result = await listDeployArtifacts(dir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('my-client-ext.zip');
  });

  test('excludes non-artifact files', async () => {
    const dir = path.join(tmpDir, 'mixed');
    await fs.ensureDir(dir);
    await fs.writeFile(path.join(dir, 'module.jar'), '');
    await fs.writeFile(path.join(dir, 'readme.txt'), '');
    await fs.writeFile(path.join(dir, 'config.json'), '');
    const result = await listDeployArtifacts(dir);
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('module.jar');
  });
});

// ---------------------------------------------------------------------------
// syncArtifactsToDirectory — copies files with deduplication
// ---------------------------------------------------------------------------

describe('syncArtifactsToDirectory', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-sync-');
  });

  afterEach(async () => {
    await fs.remove(tmpDir);
  });

  test('returns 0 when artifacts list is empty', async () => {
    const target = path.join(tmpDir, 'target');
    expect(await syncArtifactsToDirectory(target, [])).toBe(0);
  });

  test('copies artifact to target directory', async () => {
    const src = path.join(tmpDir, 'src');
    const target = path.join(tmpDir, 'target');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'module.jar'), 'compiled');

    const count = await syncArtifactsToDirectory(target, [path.join(src, 'module.jar')]);
    expect(count).toBe(1);
    expect(await fs.pathExists(path.join(target, 'module.jar'))).toBe(true);
  });

  test('skips non-existent source files', async () => {
    const target = path.join(tmpDir, 'target');
    const count = await syncArtifactsToDirectory(target, [path.join(tmpDir, 'absent.jar')]);
    expect(count).toBe(0);
  });

  test('deduplicates paths before copying', async () => {
    const src = path.join(tmpDir, 'src');
    const target = path.join(tmpDir, 'target');
    await fs.ensureDir(src);
    await fs.writeFile(path.join(src, 'module.jar'), 'compiled');

    const artifact = path.join(src, 'module.jar');
    const count = await syncArtifactsToDirectory(target, [artifact, artifact]);
    expect(count).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// collectModuleArtifacts — builds candidate paths from context
// ---------------------------------------------------------------------------

describe('collectModuleArtifacts', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = createTempDir('dev-cli-deploy-collect-');
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

  test('returns empty array when no candidate dirs exist', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    await fs.ensureDir(liferayDir);
    const ctx = makeContext(liferayDir);
    const result = await collectModuleArtifacts(ctx, 'my-module');
    expect(result).toEqual([]);
  });

  test('finds artifact in modules build/libs', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const libsDir = path.join(liferayDir, 'modules', 'my-module', 'build', 'libs');
    await fs.ensureDir(libsDir);
    await fs.writeFile(path.join(libsDir, 'my-module-1.0.0.jar'), '');

    const ctx = makeContext(liferayDir);
    const result = await collectModuleArtifacts(ctx, 'my-module');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('my-module-1.0.0.jar');
  });

  test('finds artifact in theme dist dir', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const distDir = path.join(liferayDir, 'themes', 'my-theme', 'dist');
    await fs.ensureDir(distDir);
    await fs.writeFile(path.join(distDir, 'my-theme.war'), '');

    const ctx = makeContext(liferayDir);
    const result = await collectModuleArtifacts(ctx, 'my-theme');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('my-theme.war');
  });

  test('finds .zip artifact in client-extensions dist dir', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const distDir = path.join(liferayDir, 'client-extensions', 'my-ext', 'dist');
    await fs.ensureDir(distDir);
    await fs.writeFile(path.join(distDir, 'my-ext.zip'), '');

    const ctx = makeContext(liferayDir);
    const result = await collectModuleArtifacts(ctx, 'my-ext');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('my-ext.zip');
  });

  test('finds .war artifact in wars build/libs dir', async () => {
    const liferayDir = path.join(tmpDir, 'liferay');
    const libsDir = path.join(liferayDir, 'wars', 'my-portlet', 'build', 'libs');
    await fs.ensureDir(libsDir);
    await fs.writeFile(path.join(libsDir, 'my-portlet.war'), '');

    const ctx = makeContext(liferayDir);
    const result = await collectModuleArtifacts(ctx, 'my-portlet');
    expect(result).toHaveLength(1);
    expect(result[0]).toContain('my-portlet.war');
  });
});
