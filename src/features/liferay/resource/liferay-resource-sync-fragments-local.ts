import fs from 'fs-extra';
import path from 'node:path';

import type {AppConfig} from '../../../core/config/load-config.js';
import {isRecord, parseJsonRecord, parseJsonUnknown} from '../../../core/utils/json.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveFragmentProjectDir as resolveArtifactFragmentProjectDir} from './artifact-paths.js';
import type {
  LocalFragment,
  LocalFragmentCollection,
  LocalFragmentsProject,
} from './liferay-resource-sync-fragments-types.js';

export function resolveFragmentsProjectDir(config: AppConfig, dir: string | undefined, siteToken: string): string {
  return resolveArtifactFragmentProjectDir(config, siteToken, dir);
}

export async function readLocalFragmentsProject(
  projectDir: string,
  fragmentFilter: string,
): Promise<LocalFragmentsProject> {
  const srcDir = path.join(projectDir, 'src');
  if (!(await fs.pathExists(srcDir))) {
    throw LiferayErrors.resourceError(`src directory not found in ${projectDir}`);
  }

  const collections: LocalFragmentCollection[] = [];
  const filter = fragmentFilter.trim();
  const collectionEntries = (await fs.readdir(srcDir, {withFileTypes: true}))
    .filter((entry) => entry.isDirectory())
    .sort((left, right) => left.name.localeCompare(right.name));

  for (const collectionEntry of collectionEntries) {
    const collectionDir = path.join(srcDir, collectionEntry.name);
    const fragmentsDir = path.join(collectionDir, 'fragments');
    if (!(await fs.pathExists(fragmentsDir))) {
      continue;
    }

    const collectionMeta = await readJsonIfExists(path.join(collectionDir, 'collection.json'));
    const fragmentEntries = (await fs.readdir(fragmentsDir, {withFileTypes: true}))
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name));

    const fragments: LocalFragment[] = [];
    for (const fragmentEntry of fragmentEntries) {
      const fragment = await readLocalFragment(collectionEntry.name, path.join(fragmentsDir, fragmentEntry.name));
      if (filter !== '' && !fragmentMatchesFilter(fragment, filter)) {
        continue;
      }
      fragments.push(fragment);
    }

    if (fragments.length > 0) {
      collections.push({
        slug: collectionEntry.name,
        name: ensureText(collectionMeta.name, collectionEntry.name),
        description: ensureText(collectionMeta.description, ''),
        directoryPath: collectionDir,
        fragments,
      });
    }
  }

  if (collections.length === 0) {
    if (filter !== '') {
      throw LiferayErrors.resourceError(`Fragment '${filter}' not found in ${projectDir}`);
    }
    throw LiferayErrors.resourceError(`No fragments were found to import in ${projectDir}`);
  }

  return {
    projectDir,
    collections,
  };
}

export {sanitizeArtifactToken as sanitizeFileToken} from './artifact-paths.js';

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readLocalFragment(collectionSlug: string, fragmentDir: string): Promise<LocalFragment> {
  const slug = path.basename(fragmentDir);
  const fragmentJson = await readJsonIfExists(path.join(fragmentDir, 'fragment.json'));
  const htmlPath = ensureText(fragmentJson.htmlPath, 'index.html');
  const cssPath = ensureText(fragmentJson.cssPath, 'index.css');
  const jsPath = ensureText(fragmentJson.jsPath, 'index.js');
  const configurationPath = ensureText(fragmentJson.configurationPath, 'configuration.json');
  const configuration = normalizeFragmentConfiguration(
    await readTextIfExists(path.join(fragmentDir, configurationPath)),
  );

  return {
    slug,
    name: ensureText(fragmentJson.name, slug),
    icon: ensureText(fragmentJson.icon, 'code'),
    type: ensureText(fragmentJson.type, 'component').toLowerCase() === 'section' ? 1 : 0,
    htmlPath,
    cssPath,
    jsPath,
    configurationPath,
    html: await readTextIfExists(path.join(fragmentDir, htmlPath)),
    css: await readTextIfExists(path.join(fragmentDir, cssPath)),
    js: await readTextIfExists(path.join(fragmentDir, jsPath)),
    configuration,
    directoryPath: `${collectionSlug}/fragments/${slug}`,
  };
}

function fragmentMatchesFilter(fragment: LocalFragment, filter: string): boolean {
  const normalized = filter.toLowerCase();
  return (
    fragment.slug.toLowerCase() === normalized ||
    fragment.directoryPath.toLowerCase() === normalized ||
    fragment.name.toLowerCase() === normalized
  );
}

function normalizeFragmentConfiguration(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '') {
    return JSON.stringify(defaultFragmentConfiguration());
  }

  try {
    const parsed = parseJsonRecord(trimmed);
    if (!parsed) {
      return JSON.stringify(defaultFragmentConfiguration());
    }
    if (Array.isArray(parsed.fieldSets)) {
      return JSON.stringify(parsed);
    }
    return JSON.stringify({
      ...parsed,
      fieldSets: defaultFragmentConfiguration().fieldSets,
    });
  } catch {
    return JSON.stringify(defaultFragmentConfiguration());
  }
}

function defaultFragmentConfiguration(): {fieldSets: Array<{fields: Array<Record<string, string>>}>} {
  return {
    fieldSets: [
      {
        fields: [
          {
            dataType: 'object',
            label: 'text-color',
            name: 'textColor',
            type: 'colorPalette',
          },
        ],
      },
    ],
  };
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fs.pathExists(filePath))) {
    return {};
  }

  const raw = await fs.readFile(filePath, 'utf8');
  if (raw.trim() === '') {
    return {};
  }

  const parsed = parseJsonUnknown(raw);
  return isRecord(parsed) ? parsed : {};
}

async function readTextIfExists(filePath: string): Promise<string> {
  if (!(await fs.pathExists(filePath))) {
    return '';
  }

  return fs.readFile(filePath, 'utf8');
}

function ensureText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? fallback : normalized;
}
