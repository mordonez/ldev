import fs from 'node:fs';
import path from 'node:path';

import type {ProjectType} from './project-type.js';

export type ProjectInventory = {
  liferay: {
    product: string | null;
    image: string | null;
    version: string | null;
    jvmOptsConfigured: boolean;
  };
  runtime: {
    composeFiles: string[];
    services: string[];
    ports: {
      http: string | null;
      debug: string | null;
      gogo: string | null;
      postgres: string | null;
      elasticsearch: string | null;
    };
  };
  local: {
    modules: InventoryList;
    themes: InventoryList;
    clientExtensions: InventoryList;
    wars: InventoryList;
    deployArtifacts: InventoryList;
  };
  resources: {
    structures: InventoryCount;
    templates: InventoryCount;
    adts: InventoryCount;
    fragments: InventoryCount;
    migrations: InventoryCount;
  };
};

export type InventoryList = {
  count: number;
  sample: string[];
};

export type InventoryCount = {
  path: string;
  exists: boolean;
  count: number;
};

type ResolveProjectInventoryOptions = {
  repoRoot: string | null;
  liferayDir: string | null;
  dockerDir: string | null;
  projectType: ProjectType;
  dockerEnv: Record<string, string>;
  paths: Record<'structures' | 'templates' | 'adts' | 'fragments' | 'migrations', string>;
  workspaceProduct: string | null;
};

const MAX_SAMPLE_NAMES = 5;
const SKIPPED_DIRS = new Set(['.git', '.gradle', 'build', 'dist', 'node_modules', 'node_modules_cache', 'tmp']);

export function resolveProjectInventory(options: ResolveProjectInventoryOptions): ProjectInventory {
  const liferayImage = normalizeBlank(options.dockerEnv.LIFERAY_IMAGE);
  const product = options.workspaceProduct ?? readProductFromGradleProperties(options.liferayDir ?? options.repoRoot);

  return {
    liferay: {
      product,
      image: liferayImage,
      version: product ?? extractLiferayVersion(liferayImage),
      jvmOptsConfigured: normalizeBlank(options.dockerEnv.LIFERAY_JVM_OPTS) !== null,
    },
    runtime: {
      composeFiles: inferComposeFiles(options.dockerEnv),
      services: inferComposeServices(options.dockerDir, options.dockerEnv),
      ports: {
        http: normalizeBlank(options.dockerEnv.LIFERAY_HTTP_PORT) ?? (options.repoRoot ? '8080' : null),
        debug: normalizeBlank(options.dockerEnv.LIFERAY_DEBUG_PORT),
        gogo: normalizeBlank(options.dockerEnv.GOGO_PORT),
        postgres: normalizeBlank(options.dockerEnv.POSTGRES_PORT),
        elasticsearch: normalizeBlank(options.dockerEnv.ES_HTTP_PORT),
      },
    },
    local: {
      modules: listImmediateDirectories(resolveLocalPath(options.liferayDir, 'modules')),
      themes: listImmediateDirectories(resolveLocalPath(options.liferayDir, 'themes')),
      clientExtensions: listClientExtensions(options.repoRoot, options.liferayDir, options.projectType),
      wars: listImmediateDirectories(resolveLocalPath(options.liferayDir, 'wars')),
      deployArtifacts: listDeployArtifacts(options.liferayDir),
    },
    resources: {
      structures: countResourceFiles(options.repoRoot, options.paths.structures, ['.json']),
      templates: countResourceFiles(options.repoRoot, options.paths.templates, ['.ftl', '.vm', '.json']),
      adts: countResourceFiles(options.repoRoot, options.paths.adts, ['.ftl', '.vm', '.json']),
      fragments: countResourceFiles(options.repoRoot, options.paths.fragments, [
        '.html',
        '.css',
        '.js',
        '.json',
        '.ftl',
      ]),
      migrations: countResourceFiles(options.repoRoot, options.paths.migrations, ['.ts', '.js', '.mjs', '.json']),
    },
  };
}

function normalizeBlank(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function readProductFromGradleProperties(rootDir: string | null): string | null {
  if (!rootDir) {
    return null;
  }

  const gradlePropertiesPath = path.join(rootDir, 'gradle.properties');
  if (!fs.existsSync(gradlePropertiesPath)) {
    return null;
  }

  const line = fs
    .readFileSync(gradlePropertiesPath, 'utf8')
    .split(/\r?\n/)
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith('liferay.workspace.product='));

  return line?.split('=').slice(1).join('=').trim() || null;
}

function extractLiferayVersion(image: string | null): string | null {
  if (!image) {
    return null;
  }

  const tag = image.includes(':') ? image.split(':').at(-1) : image.split('/').at(-1);
  return tag?.trim() || null;
}

function inferComposeServices(dockerDir: string | null, dockerEnv: Record<string, string>): string[] {
  if (!dockerDir) {
    return [];
  }

  const composeFiles = inferComposeFiles(dockerEnv);
  const services = new Set<string>();

  for (const fileName of composeFiles) {
    const basename = path.basename(fileName);
    if (basename === 'docker-compose.yml') {
      services.add('liferay');
    }
    if (basename.includes('postgres')) {
      services.add('postgres');
    }
    if (basename.includes('elasticsearch')) {
      services.add('elasticsearch');
    }
  }

  if (fs.existsSync(path.join(dockerDir, 'docker-compose.postgres.yml'))) {
    services.add('postgres-available');
  }
  if (fs.existsSync(path.join(dockerDir, 'docker-compose.elasticsearch.yml'))) {
    services.add('elasticsearch-available');
  }

  return [...services].sort();
}

function inferComposeFiles(dockerEnv: Record<string, string>): string[] {
  const composeFile = normalizeBlank(dockerEnv.COMPOSE_FILE);
  return composeFile
    ? composeFile
        .split(path.delimiter)
        .map((entry) => entry.trim())
        .filter(Boolean)
    : ['docker-compose.yml'];
}

function resolveLocalPath(rootDir: string | null, child: string): string | null {
  return rootDir ? path.join(rootDir, child) : null;
}

function listClientExtensions(
  repoRoot: string | null,
  liferayDir: string | null,
  projectType: ProjectType,
): InventoryList {
  const roots =
    projectType === 'blade-workspace'
      ? [repoRoot ? path.join(repoRoot, 'client-extensions') : null]
      : [
          liferayDir ? path.join(liferayDir, 'client-extensions') : null,
          repoRoot ? path.join(repoRoot, 'client-extensions') : null,
        ];

  return mergeInventoryLists(roots.map((root) => listImmediateDirectories(root)));
}

function listImmediateDirectories(dir: string | null): InventoryList {
  if (!dir || !fs.existsSync(dir)) {
    return {count: 0, sample: []};
  }

  const sample = fs
    .readdirSync(dir, {withFileTypes: true})
    .filter((entry) => entry.isDirectory() && !SKIPPED_DIRS.has(entry.name))
    .map((entry) => entry.name)
    .sort();

  return {count: sample.length, sample: sample.slice(0, MAX_SAMPLE_NAMES)};
}

function mergeInventoryLists(lists: InventoryList[]): InventoryList {
  const sample = [...new Set(lists.flatMap((list) => list.sample))].sort();
  return {
    count: lists.reduce((total, list) => total + list.count, 0),
    sample: sample.slice(0, MAX_SAMPLE_NAMES),
  };
}

function listDeployArtifacts(liferayDir: string | null): InventoryList {
  const deployDir = liferayDir ? path.join(liferayDir, 'build', 'docker', 'deploy') : null;
  if (!deployDir || !fs.existsSync(deployDir)) {
    return {count: 0, sample: []};
  }

  const sample = fs
    .readdirSync(deployDir, {withFileTypes: true})
    .filter((entry) => entry.isFile() && /\.(jar|war|xml)$/i.test(entry.name))
    .map((entry) => entry.name)
    .sort();

  return {count: sample.length, sample: sample.slice(0, MAX_SAMPLE_NAMES)};
}

function countResourceFiles(repoRoot: string | null, relativePath: string, extensions: string[]): InventoryCount {
  const targetPath = repoRoot ? path.resolve(repoRoot, relativePath) : relativePath;
  if (!repoRoot || !fs.existsSync(targetPath)) {
    return {path: relativePath, exists: false, count: 0};
  }

  return {
    path: relativePath,
    exists: true,
    count: countFiles(targetPath, new Set(extensions)),
  };
}

function countFiles(dir: string, extensions: Set<string>): number {
  let total = 0;

  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRS.has(entry.name)) {
        total += countFiles(path.join(dir, entry.name), extensions);
      }
      continue;
    }

    if (entry.isFile() && extensions.has(path.extname(entry.name).toLowerCase())) {
      total += 1;
    }
  }

  return total;
}
