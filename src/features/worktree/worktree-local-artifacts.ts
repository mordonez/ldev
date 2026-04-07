import path from 'node:path';

import fs from 'fs-extra';

import {runProcess} from '../../core/platform/process.js';

type WorktreeLocalArtifact =
  | {
      kind: 'file';
      relativePath: string;
    }
  | {
      kind: 'dir-symlink';
      relativePath: string;
    };

const WORKTREE_LOCAL_ARTIFACTS: readonly WorktreeLocalArtifact[] = [
  {kind: 'file', relativePath: '.liferay-cli.local.yml'},
  {kind: 'dir-symlink', relativePath: 'node_modules'},
  {kind: 'file', relativePath: path.join('liferay', 'package.json')},
  {kind: 'file', relativePath: path.join('liferay', 'yarn.lock')},
  {kind: 'file', relativePath: path.join('liferay', '.yarnrc')},
  {kind: 'dir-symlink', relativePath: path.join('liferay', 'node_modules')},
  {kind: 'dir-symlink', relativePath: path.join('liferay', 'node_modules_cache')},
];

export async function syncWorktreeLocalArtifacts(mainRepoRoot: string, worktreeDir: string): Promise<string[]> {
  const synced: string[] = [];

  for (const artifact of WORKTREE_LOCAL_ARTIFACTS) {
    const sourcePath = path.join(mainRepoRoot, artifact.relativePath);
    if (!(await fs.pathExists(sourcePath))) {
      continue;
    }

    const targetPath = path.join(worktreeDir, artifact.relativePath);
    if (await fs.pathExists(targetPath)) {
      continue;
    }

    await fs.ensureDir(path.dirname(targetPath));

    if (artifact.kind === 'file') {
      await fs.copy(sourcePath, targetPath, {overwrite: false, errorOnExist: true});
    } else {
      const relativeSourcePath = path.relative(path.dirname(targetPath), sourcePath);
      await fs.symlink(relativeSourcePath, targetPath, process.platform === 'win32' ? 'junction' : 'dir');
    }

    synced.push(artifact.relativePath);
  }

  synced.push(...(await syncIgnoredModuleSources(mainRepoRoot, worktreeDir)));
  synced.push(...(await syncIgnoredConfigFiles(mainRepoRoot, worktreeDir)));

  return synced;
}

async function syncIgnoredModuleSources(mainRepoRoot: string, worktreeDir: string): Promise<string[]> {
  const ignoredPaths = await listIgnoredPaths(
    mainRepoRoot,
    path.join('liferay', 'modules'),
    shouldSyncIgnoredModulePath,
  );
  const synced: string[] = [];

  for (const relativePath of ignoredPaths) {
    if (!shouldSyncIgnoredModulePath(relativePath)) {
      continue;
    }

    const sourcePath = path.join(mainRepoRoot, relativePath);
    const targetPath = path.join(worktreeDir, relativePath);

    if (!(await fs.pathExists(sourcePath)) || (await fs.pathExists(targetPath))) {
      continue;
    }

    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(sourcePath, targetPath, {overwrite: false, errorOnExist: true});
    synced.push(relativePath);
  }

  return synced;
}

async function syncIgnoredConfigFiles(mainRepoRoot: string, worktreeDir: string): Promise<string[]> {
  const ignoredPaths = [
    ...(await listIgnoredPaths(mainRepoRoot, path.join('liferay', 'configs'), shouldSyncIgnoredConfigPath)),
    ...(await listIgnoredPaths(
      mainRepoRoot,
      path.join('liferay', 'build', 'docker', 'configs'),
      shouldSyncIgnoredConfigPath,
    )),
  ];
  const synced: string[] = [];

  for (const relativePath of ignoredPaths) {
    const sourcePath = path.join(mainRepoRoot, relativePath);
    const targetPath = path.join(worktreeDir, relativePath);

    if (!(await fs.pathExists(sourcePath)) || (await fs.pathExists(targetPath))) {
      continue;
    }

    await fs.ensureDir(path.dirname(targetPath));
    await fs.copy(sourcePath, targetPath, {overwrite: false, errorOnExist: true});
    synced.push(relativePath);
  }

  return synced;
}

async function listIgnoredPaths(
  repoRoot: string,
  relativeRoot: string,
  predicate: (relativePath: string) => boolean,
): Promise<string[]> {
  const scanRoot = path.join(repoRoot, relativeRoot);
  if (!(await fs.pathExists(scanRoot))) {
    return [];
  }

  const candidates = await collectIgnoredPathCandidates(repoRoot, scanRoot, predicate);
  if (candidates.length === 0) {
    return [];
  }

  const result = await runProcess('git', ['check-ignore', '--stdin'], {
    cwd: repoRoot,
    input: `${candidates.join('\n')}\n`,
    reject: false,
  });

  if (!result.ok && result.exitCode !== 1) {
    return [];
  }

  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
}

function shouldSyncIgnoredModulePath(relativePath: string): boolean {
  return (
    relativePath.startsWith('liferay/modules/') &&
    (relativePath.includes('/src/main/java/') ||
      relativePath.includes('/src/main/resources/') ||
      relativePath.endsWith('/.serviceBuilder'))
  );
}

function shouldSyncIgnoredConfigPath(relativePath: string): boolean {
  return relativePath.startsWith('liferay/configs/') || relativePath.startsWith('liferay/build/docker/configs/');
}

async function collectIgnoredPathCandidates(
  repoRoot: string,
  currentDir: string,
  predicate: (relativePath: string) => boolean,
): Promise<string[]> {
  const entries = await fs.readdir(currentDir, {withFileTypes: true});
  const candidates: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(currentDir, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath).split(path.sep).join('/');

    if (entry.isDirectory()) {
      if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === 'node_modules_cache') {
        continue;
      }

      candidates.push(...(await collectIgnoredPathCandidates(repoRoot, absolutePath, predicate)));
      continue;
    }

    if (predicate(relativePath)) {
      candidates.push(relativePath);
    }
  }

  return candidates;
}
