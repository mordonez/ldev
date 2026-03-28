import path from 'node:path';
import {fileURLToPath} from 'node:url';

import fs from 'fs-extra';

export type ProjectAssets = {
  repoRoot: string;
  scaffoldDir: string;
  dockerDir: string;
  liferayDir: string;
  modulesDir: string;
};

export function resolveProjectAssets(repoRoot = getDefaultRepoRoot()): ProjectAssets {
  const templatesDir = path.join(repoRoot, 'templates');
  return {
    repoRoot,
    scaffoldDir: templatesDir,
    dockerDir: path.join(templatesDir, 'docker'),
    liferayDir: path.join(templatesDir, 'liferay'),
    modulesDir: path.join(templatesDir, 'modules'),
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
    ...(await copyMissingFile(path.join(assets.scaffoldDir, '.gitignore'), path.join(targetDir, '.gitignore'))),
  );

  return copied;
}

export async function ensureDockerScaffold(targetDir: string, assets: ProjectAssets): Promise<boolean> {
  const destination = path.join(targetDir, 'docker');
  if (await fs.pathExists(destination)) {
    return false;
  }

  await fs.ensureDir(destination);
  await copyAsset(assets.dockerDir, destination, '.env.example');
  await copyAsset(assets.dockerDir, destination, 'docker-compose.yml');
  await copyAsset(assets.dockerDir, destination, 'elasticsearch/Dockerfile');
  await copyAsset(assets.dockerDir, destination, 'liferay-scripts/pre-startup/configure-session-cookie.sh');
  await copyAsset(assets.dockerDir, destination, 'liferay-scripts/pre-startup/install-activation-key.sh');
  await ensureFile(path.join(destination, 'postgres', 'init', '.gitkeep'));
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
  await copyAsset(assets.liferayDir, destination, '.gitignore');
  await copyAsset(assets.liferayDir, destination, 'build.gradle');
  await copyAsset(assets.liferayDir, destination, 'gradle.properties');
  await copyAsset(assets.liferayDir, destination, 'settings.gradle');
  await copyAsset(assets.liferayDir, destination, 'gradlew');
  await copyAsset(assets.liferayDir, destination, 'gradlew.bat');
  await copyAsset(assets.liferayDir, destination, 'gradle/wrapper/gradle-wrapper.jar');
  await copyAsset(assets.liferayDir, destination, 'gradle/wrapper/gradle-wrapper.properties');
  await copyAsset(assets.liferayDir, destination, 'configs/dockerenv/portal-ext.properties');
  await copyAsset(assets.liferayDir, destination, 'configs/dockerenv/portal-setup-wizard.properties');
  await copyAsset(
    assets.liferayDir,
    destination,
    'configs/dockerenv/osgi/configs/com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config',
  );
  await ensureFile(path.join(destination, 'configs', 'dockerenv', 'osgi', 'modules', '.gitkeep'));
  await ensureFile(path.join(destination, 'modules', '.gitkeep'));
  return true;
}

export async function ensureBootstrapModule(targetDir: string, assets: ProjectAssets): Promise<boolean> {
  const destination = path.join(targetDir, 'liferay', 'modules', 'liferay-cli-bootstrap');
  if (await fs.pathExists(destination)) {
    return false;
  }

  await fs.ensureDir(destination);
  await copyAsset(assets.modulesDir, destination, 'README.md');
  await copyAsset(assets.modulesDir, destination, 'bnd.bnd');
  await copyAsset(assets.modulesDir, destination, 'build.gradle');
  await copyDirectory(path.join(assets.modulesDir, 'src'), path.join(destination, 'src'));
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

async function copyAsset(sourceRoot: string, destinationRoot: string, relativePath: string): Promise<void> {
  await fs.copy(path.join(sourceRoot, relativePath), path.join(destinationRoot, relativePath), {overwrite: true});
}

async function copyDirectory(sourceDir: string, destinationDir: string): Promise<void> {
  await fs.copy(sourceDir, destinationDir, {overwrite: true});
}

async function ensureFile(filePath: string): Promise<void> {
  await fs.ensureDir(path.dirname(filePath));
  if (!(await fs.pathExists(filePath))) {
    await fs.writeFile(filePath, '');
  }
}

function findPackageRoot(fromFile: string): string {
  let current = path.dirname(fromFile);

  while (true) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'templates'))) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`No se pudo resolver la raíz del paquete ldev desde ${fromFile}`);
    }
    current = parent;
  }
}
