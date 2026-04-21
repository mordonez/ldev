import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fs from 'fs-extra';

import {CliError} from '../../core/errors.js';

export type ProjectAssets = {
  repoRoot: string;
  scaffoldDir: string;
  dockerDir: string;
  liferayDir: string;
  modulesDir: string;
  bundlesDir: string;
};

export function resolveProjectAssets(repoRoot = getDefaultRepoRoot()): ProjectAssets {
  const templatesDir = path.join(repoRoot, 'templates');
  return {
    repoRoot,
    scaffoldDir: templatesDir,
    dockerDir: path.join(templatesDir, 'docker'),
    liferayDir: path.join(templatesDir, 'liferay'),
    modulesDir: path.join(templatesDir, 'modules'),
    bundlesDir: path.join(templatesDir, 'bundles'),
  };
}

export async function copyProjectScaffoldFiles(targetDir: string, assets: ProjectAssets): Promise<string[]> {
  const copied: string[] = [];

  copied.push(
    ...(await copyMissingFile(
      path.join(assets.scaffoldDir, '.liferay-cli.yml'),
      path.join(targetDir, '.liferay-cli.yml'),
    )),
  );
  copied.push(
    ...(await copyMissingFileFromCandidates(
      [path.join(assets.scaffoldDir, '.gitignore'), path.join(assets.scaffoldDir, 'gitignore')],
      path.join(targetDir, '.gitignore'),
    )),
  );
  copied.push(
    ...(await copyMissingFileFromCandidates(
      [path.join(assets.scaffoldDir, '.gitattributes'), path.join(assets.scaffoldDir, 'gitattributes')],
      path.join(targetDir, '.gitattributes'),
    )),
  );

  return copied;
}

export type DockerService = 'postgres' | 'elasticsearch';

export async function ensureDockerScaffold(
  targetDir: string,
  assets: ProjectAssets,
  services: DockerService[] = [],
): Promise<boolean> {
  const destination = path.join(targetDir, 'docker');
  if (await fs.pathExists(destination)) {
    return false;
  }

  await fs.ensureDir(destination);
  await copyAsset(assets.dockerDir, destination, '.env.example');
  await copyAsset(assets.dockerDir, destination, 'docker-compose.yml');
  await copyAsset(assets.dockerDir, destination, 'docker-compose.liferay.volume.yml');
  await ensureFile(path.join(destination, 'sql', 'post-import.d', '.gitkeep'));

  if (services.includes('postgres')) {
    await copyAsset(assets.dockerDir, destination, 'docker-compose.postgres.yml');
    await copyAsset(assets.dockerDir, destination, 'docker-compose.postgres.volume.yml');
    await ensureFile(path.join(destination, 'postgres', 'init', '.gitkeep'));
  }

  if (services.includes('elasticsearch')) {
    await copyAsset(assets.dockerDir, destination, 'docker-compose.elasticsearch.yml');
    await copyAsset(assets.dockerDir, destination, 'docker-compose.elasticsearch.volume.yml');
    await copyAsset(assets.dockerDir, destination, 'elasticsearch/Dockerfile');
  }

  await fs.copy(path.join(assets.dockerDir, 'liferay-configs-full'), path.join(destination, 'liferay-configs-full'), {
    overwrite: true,
  });
  await copyAsset(assets.dockerDir, destination, 'liferay-scripts/pre-startup/configure-session-cookie.sh');
  await copyAsset(assets.dockerDir, destination, 'liferay-scripts/pre-startup/install-activation-key.sh');
  await ensureFile(path.join(destination, 'patching', '.gitkeep'));
  await ensureFile(path.join(destination, 'dumps', '.gitkeep'));
  await fs.copy(path.join(assets.dockerDir, '.env.example'), path.join(destination, '.env'), {overwrite: true});
  return true;
}

export async function ensureLiferayScaffold(targetDir: string, assets: ProjectAssets): Promise<boolean> {
  const destination = path.join(targetDir, 'liferay');
  if (await fs.pathExists(destination)) {
    return false;
  }

  await fs.ensureDir(destination);
  await copyAssetFromCandidates(assets.liferayDir, destination, '.gitignore', ['.gitignore', 'gitignore']);
  await copyAsset(assets.liferayDir, destination, 'build.gradle');
  await copyAsset(assets.liferayDir, destination, 'gradle.properties');
  await copyAsset(assets.liferayDir, destination, 'settings.gradle');
  await copyAsset(assets.liferayDir, destination, 'gradlew');
  await copyAsset(assets.liferayDir, destination, 'gradlew.bat');
  await copyAsset(assets.liferayDir, destination, 'gradle/wrapper/gradle-wrapper.jar');
  await copyAsset(assets.liferayDir, destination, 'gradle/wrapper/gradle-wrapper.properties');
  await fs.copy(path.join(assets.liferayDir, 'configs', 'common'), path.join(destination, 'configs', 'common'), {
    overwrite: true,
  });
  await ensureLiferayDockerenvScaffold(targetDir, assets);
  await ensureFile(path.join(destination, 'modules', '.gitkeep'));
  return true;
}

export async function ensureLiferayDockerenvScaffold(targetDir: string, assets: ProjectAssets): Promise<boolean> {
  const liferayDir = path.join(targetDir, 'liferay');
  if (!(await fs.pathExists(liferayDir))) {
    return false;
  }

  const dockerenvDir = path.join(liferayDir, 'configs', 'dockerenv');
  if (await fs.pathExists(dockerenvDir)) {
    return false;
  }

  await copyAsset(assets.liferayDir, liferayDir, 'configs/dockerenv/portal-ext.properties');
  await copyAsset(assets.liferayDir, liferayDir, 'configs/dockerenv/portal-setup-wizard.properties');
  await copyAsset(
    assets.liferayDir,
    liferayDir,
    'configs/dockerenv/osgi/configs/com.liferay.portal.store.file.system.configuration.AdvancedFileSystemStoreConfiguration.config',
  );
  await ensureFile(path.join(dockerenvDir, 'osgi', 'configs', '.gitkeep'));
  await ensureFile(path.join(dockerenvDir, 'osgi', 'modules', '.gitkeep'));
  return true;
}

function getDefaultRepoRoot(): string {
  return findPackageRoot(fileURLToPath(import.meta.url));
}

async function copyMissingFile(source: string, destination: string): Promise<string[]> {
  if (await fs.pathExists(destination)) {
    return [];
  }

  await fs.copy(source, destination);
  return [path.basename(destination)];
}

async function copyMissingFileFromCandidates(sourceCandidates: string[], destination: string): Promise<string[]> {
  if (await fs.pathExists(destination)) {
    return [];
  }

  for (const source of sourceCandidates) {
    if (await fs.pathExists(source)) {
      await fs.copy(source, destination);
      return [path.basename(destination)];
    }
  }

  throw new CliError(`Missing scaffold asset for ${destination}`, {code: 'PROJECT_SCAFFOLD_ASSET_MISSING'});
}

async function copyAsset(sourceRoot: string, destinationRoot: string, relativePath: string): Promise<void> {
  await fs.copy(path.join(sourceRoot, relativePath), path.join(destinationRoot, relativePath), {overwrite: true});
}

async function copyAssetFromCandidates(
  sourceRoot: string,
  destinationRoot: string,
  destinationRelativePath: string,
  sourceCandidates: string[],
): Promise<void> {
  for (const sourceRelativePath of sourceCandidates) {
    const sourcePath = path.join(sourceRoot, sourceRelativePath);
    if (await fs.pathExists(sourcePath)) {
      await fs.copy(sourcePath, path.join(destinationRoot, destinationRelativePath), {overwrite: true});
      return;
    }
  }

  throw new CliError(`Missing scaffold asset for ${destinationRelativePath} in ${sourceRoot}`, {
    code: 'PROJECT_SCAFFOLD_ASSET_MISSING',
  });
}

async function ensureFile(filePath: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  if (!(await fs.pathExists(filePath))) {
    await fs.writeFile(filePath, '');
  }
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  for (;;) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new CliError(`Could not resolve the ldev package root from ${fromFile}`, {
        code: 'PROJECT_PACKAGE_ROOT_NOT_FOUND',
      });
    }
    current = parent;
  }
}
