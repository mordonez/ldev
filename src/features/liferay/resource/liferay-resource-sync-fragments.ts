import fs from 'fs-extra';
import JSZip from 'jszip';
import os from 'node:os';
import path from 'node:path';

import {CliError} from '../../../core/errors.js';
import type {AppConfig} from '../../../core/config/load-config.js';
import type {HttpResponse} from '../../../core/http/client.js';
import {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import {resolveFragmentsBaseDir, resolveRepoPath, resolveSiteToken} from './liferay-resource-paths.js';
import {listFragmentCollections, listFragments, resolveResourceSite} from './liferay-resource-shared.js';
import {authedPostForm, authedPostMultipart, type ResourceSyncDependencies} from './liferay-resource-sync-shared.js';

type LocalFragment = {
  slug: string;
  name: string;
  icon: string;
  type: number;
  htmlPath: string;
  cssPath: string;
  jsPath: string;
  configurationPath: string;
  html: string;
  css: string;
  js: string;
  configuration: string;
  directoryPath: string;
};

type LocalFragmentCollection = {
  slug: string;
  name: string;
  description: string;
  directoryPath: string;
  fragments: LocalFragment[];
};

type LocalFragmentsProject = {
  projectDir: string;
  collections: LocalFragmentCollection[];
};

export type LiferayResourceSyncFragmentItemResult = {
  collection: string;
  fragment: string;
  status: 'imported' | 'error';
  fragmentEntryId?: number;
  error?: string;
};

export type LiferayResourceSyncFragmentsSingleResult = {
  mode: 'oauth-jsonws-import' | 'oauth-zip-import';
  site: string;
  siteId: number;
  projectDir: string;
  summary: {
    importedFragments: number;
    fragmentResults: number;
    pageTemplateResults: number;
    errors: number;
  };
  fragmentResults: LiferayResourceSyncFragmentItemResult[];
  pageTemplateResults: unknown[];
};

export type LiferayResourceSyncFragmentsAllSitesResult = {
  mode: 'all-sites';
  sites: number;
  imported: number;
  errors: number;
  siteResults: LiferayResourceSyncFragmentsSingleResult[];
};

export type LiferayResourceSyncFragmentsResult =
  | LiferayResourceSyncFragmentsSingleResult
  | LiferayResourceSyncFragmentsAllSitesResult;

export async function runLiferayResourceSyncFragments(
  config: AppConfig,
  options?: {
    site?: string;
    groupId?: string;
    allSites?: boolean;
    dir?: string;
    fragment?: string;
  },
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsResult> {
  if (options?.allSites && (options?.fragment ?? '').trim() !== '') {
    throw new CliError('--fragment requires --site or --site-id', {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  if (options?.allSites) {
    const sites = await runLiferayInventorySitesIncludingGlobal(config, undefined, dependencies);
    const siteResults: LiferayResourceSyncFragmentsSingleResult[] = [];
    let imported = 0;
    let errors = 0;

    for (const site of sites) {
      const projectDir = resolveFragmentsProjectDir(config, options?.dir, resolveSiteToken(site.siteFriendlyUrl));
      if (!(await fs.pathExists(path.join(projectDir, 'src')))) {
        continue;
      }

      const siteResult = await runFragmentsImport(
        config,
        site.groupId,
        site.siteFriendlyUrl,
        projectDir,
        '',
        dependencies,
      );
      siteResults.push(siteResult);
      imported += siteResult.summary.importedFragments;
      errors += siteResult.summary.errors;
    }

    return {
      mode: 'all-sites',
      sites: siteResults.length,
      imported,
      errors,
      siteResults,
    };
  }

  const site = options?.groupId?.trim()
    ? await resolveResourceSite(config, options.groupId, dependencies)
    : await resolveResourceSite(config, options?.site ?? '/global', dependencies);
  const projectDir = resolveFragmentsProjectDir(config, options?.dir, resolveSiteToken(site.friendlyUrlPath));

  return runFragmentsImport(config, site.id, site.friendlyUrlPath, projectDir, options?.fragment ?? '', dependencies);
}

export function formatLiferayResourceSyncFragments(result: LiferayResourceSyncFragmentsResult): string {
  if (result.mode === 'all-sites') {
    return `sites=${result.sites} imported=${result.imported} errors=${result.errors} mode=all-sites`;
  }

  return `imported=${result.summary.importedFragments} errors=${result.summary.errors}`;
}

export function getLiferayResourceSyncFragmentsExitCode(result: LiferayResourceSyncFragmentsResult): number {
  return result.mode === 'all-sites' ? (result.errors > 0 ? 1 : 0) : result.summary.errors > 0 ? 1 : 0;
}

async function runFragmentsImport(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  projectDir: string,
  fragmentFilter: string,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const project = await readLocalFragmentsProject(projectDir, fragmentFilter);
  try {
    return await runFragmentsZipImport(config, groupId, siteFriendlyUrl, project, dependencies);
  } catch {
    // Fallback to JSONWS entry-by-entry updates for portals that do not support ZIP import.
  }

  return runFragmentsImportLegacy(config, groupId, siteFriendlyUrl, projectDir, project, dependencies);
}

async function runFragmentsImportLegacy(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  projectDir: string,
  project: LocalFragmentsProject,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const collections = await listFragmentCollections(config, groupId, dependencies);
  const collectionByKey = new Map<string, Record<string, unknown>>();

  for (const collection of collections) {
    const key = String(collection.fragmentCollectionKey ?? '').trim();
    const name = String(collection.name ?? '').trim();
    if (key !== '') {
      collectionByKey.set(key.toLowerCase(), collection);
    }
    if (name !== '') {
      collectionByKey.set(sanitizeFileToken(name).toLowerCase(), collection);
    }
  }

  let imported = 0;
  let errors = 0;
  const fragmentResults: LiferayResourceSyncFragmentItemResult[] = [];

  for (const localCollection of project.collections) {
    try {
      let runtimeCollection = collectionByKey.get(localCollection.slug.toLowerCase());
      if (!runtimeCollection) {
        runtimeCollection = await createFragmentCollection(config, groupId, localCollection, dependencies);
        collectionByKey.set(localCollection.slug.toLowerCase(), runtimeCollection);
      } else {
        await updateFragmentCollection(
          config,
          Number(runtimeCollection.fragmentCollectionId ?? -1),
          localCollection,
          dependencies,
        );
      }

      const collectionId = Number(runtimeCollection.fragmentCollectionId ?? -1);
      if (collectionId <= 0) {
        throw new CliError(`fragmentCollectionId invalido para ${localCollection.slug}`, {
          code: 'LIFERAY_RESOURCE_ERROR',
        });
      }

      const runtimeFragments = await listFragments(config, collectionId, dependencies);
      const runtimeByKey = new Map<string, Record<string, unknown>>();
      for (const runtimeFragment of runtimeFragments) {
        const runtimeKey = String(runtimeFragment.fragmentEntryKey ?? '').trim();
        const runtimeName = String(runtimeFragment.name ?? '').trim();
        if (runtimeKey !== '') {
          runtimeByKey.set(runtimeKey.toLowerCase(), runtimeFragment);
        }
        if (runtimeName !== '') {
          runtimeByKey.set(sanitizeFileToken(runtimeName).toLowerCase(), runtimeFragment);
        }
      }

      for (const localFragment of localCollection.fragments) {
        try {
          const runtimeFragment = runtimeByKey.get(localFragment.slug.toLowerCase());
          const syncedFragment = runtimeFragment
            ? await updateFragmentEntry(
                config,
                groupId,
                collectionId,
                Number(runtimeFragment.fragmentEntryId ?? -1),
                localFragment,
                dependencies,
              )
            : await createFragmentEntry(config, groupId, collectionId, localFragment, dependencies);

          fragmentResults.push({
            collection: localCollection.slug,
            fragment: localFragment.slug,
            status: 'imported',
            fragmentEntryId: Number(syncedFragment.fragmentEntryId ?? -1),
          });
          imported += 1;
        } catch (error) {
          fragmentResults.push({
            collection: localCollection.slug,
            fragment: localFragment.slug,
            status: 'error',
            error: toErrorMessage(error),
          });
          errors += 1;
        }
      }
    } catch (error) {
      for (const localFragment of localCollection.fragments) {
        fragmentResults.push({
          collection: localCollection.slug,
          fragment: localFragment.slug,
          status: 'error',
          error: toErrorMessage(error),
        });
        errors += 1;
      }
    }
  }

  return {
    mode: 'oauth-jsonws-import',
    site: siteFriendlyUrl,
    siteId: groupId,
    projectDir,
    summary: {
      importedFragments: imported,
      fragmentResults: fragmentResults.length,
      pageTemplateResults: 0,
      errors,
    },
    fragmentResults,
    pageTemplateResults: [],
  };
}

async function readLocalFragmentsProject(projectDir: string, fragmentFilter: string): Promise<LocalFragmentsProject> {
  const srcDir = path.join(projectDir, 'src');
  if (!(await fs.pathExists(srcDir))) {
    throw new CliError(`src directory not found in ${projectDir}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
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
      throw new CliError(`Fragment '${filter}' not found in ${projectDir}`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }
    throw new CliError(`No fragments were found to import in ${projectDir}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  return {
    projectDir,
    collections,
  };
}

async function runFragmentsZipImport(
  config: AppConfig,
  groupId: number,
  siteFriendlyUrl: string,
  project: LocalFragmentsProject,
  dependencies?: ResourceSyncDependencies,
): Promise<LiferayResourceSyncFragmentsSingleResult> {
  const importDir = await prepareFragmentsImportDir(project);
  try {
    const zipBuffer = await zipDirectory(importDir.dirPath);
    const form = new FormData();
    form.append('groupId', String(groupId));
    form.append('file', new Blob([zipBuffer], {type: 'application/zip'}), 'liferay-fragments.zip');

    const response = await authedPostMultipart<Record<string, unknown> | string>(
      config,
      '/c/portal/fragment/import_fragment_entries',
      form,
      dependencies,
    );

    if (!response.ok) {
      throw new CliError(`fragment zip import failed with status=${response.status}.`, {
        code: 'LIFERAY_RESOURCE_ERROR',
      });
    }

    const payload = response.data;
    if (typeof payload === 'string') {
      throw new CliError(payload, {code: 'LIFERAY_RESOURCE_ERROR'});
    }
    if (payload && typeof payload === 'object' && typeof payload.error === 'string' && payload.error.trim() !== '') {
      throw new CliError(payload.error, {code: 'LIFERAY_RESOURCE_ERROR'});
    }

    const importResults = Array.isArray(payload?.fragmentEntriesImportResult)
      ? payload.fragmentEntriesImportResult.filter(
          (item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object',
        )
      : [];
    const importResultByName = new Map(
      importResults.map((item) => [
        String(item.name ?? '')
          .trim()
          .toLowerCase(),
        item,
      ]),
    );
    const fragmentResults = project.collections.flatMap((collection) =>
      collection.fragments.map((fragment) => {
        const importResult = importResultByName.get(fragment.name.trim().toLowerCase());
        const errorMessage = String(importResult?.errorMessage ?? '').trim();
        return {
          collection: collection.slug,
          fragment: fragment.slug,
          status: errorMessage === '' ? ('imported' as const) : ('error' as const),
          ...(errorMessage === '' ? {} : {error: errorMessage}),
        };
      }),
    );
    const pageTemplateResults = Array.isArray(payload?.pageTemplatesImportResult)
      ? payload.pageTemplatesImportResult
      : [];
    const errors = fragmentResults.filter((item) => item.status === 'error').length;

    return {
      mode: 'oauth-zip-import',
      site: siteFriendlyUrl,
      siteId: groupId,
      projectDir: project.projectDir,
      summary: {
        importedFragments: fragmentResults.filter((item) => item.status === 'imported').length,
        fragmentResults: fragmentResults.length,
        pageTemplateResults: pageTemplateResults.length,
        errors,
      },
      fragmentResults,
      pageTemplateResults,
    };
  } finally {
    await importDir.cleanup();
  }
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

async function prepareFragmentsImportDir(
  project: LocalFragmentsProject,
): Promise<{dirPath: string; cleanup: () => Promise<void>}> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dev-cli-fragments-import-'));
  const tempProjectDir = path.join(tempDir, 'project');
  const tempSrcDir = path.join(tempProjectDir, 'src');
  await fs.ensureDir(tempSrcDir);

  for (const collection of project.collections) {
    const targetCollectionDir = path.join(tempSrcDir, collection.slug);
    await fs.ensureDir(targetCollectionDir);

    const collectionEntries = await fs.readdir(collection.directoryPath, {withFileTypes: true});
    for (const entry of collectionEntries) {
      if (entry.name === 'fragments') {
        continue;
      }
      await fs.copy(path.join(collection.directoryPath, entry.name), path.join(targetCollectionDir, entry.name));
    }

    for (const fragment of collection.fragments) {
      const sourceFragmentDir = path.join(collection.directoryPath, 'fragments', fragment.slug);
      const targetFragmentDir = path.join(targetCollectionDir, fragment.slug);
      await fs.copy(sourceFragmentDir, targetFragmentDir);
      await fs.writeFile(path.join(targetFragmentDir, fragment.htmlPath), fragment.html);
      await fs.writeFile(path.join(targetFragmentDir, fragment.cssPath), fragment.css);
      await fs.writeFile(path.join(targetFragmentDir, fragment.jsPath), fragment.js);
      await fs.writeFile(path.join(targetFragmentDir, fragment.configurationPath), `${fragment.configuration}\n`);
    }
  }

  return {
    dirPath: tempProjectDir,
    cleanup: async () => {
      await fs.remove(tempDir);
    },
  };
}

async function zipDirectory(dirPath: string): Promise<Buffer> {
  const zip = new JSZip();
  await addDirectoryToZip(zip, dirPath, dirPath);
  return zip.generateAsync({type: 'nodebuffer'});
}

async function addDirectoryToZip(zip: JSZip, rootDir: string, currentDir: string): Promise<void> {
  const entries = await fs.readdir(currentDir, {withFileTypes: true});
  for (const entry of entries) {
    const entryPath = path.join(currentDir, entry.name);
    if (entry.isDirectory()) {
      await addDirectoryToZip(zip, rootDir, entryPath);
      continue;
    }
    if (entry.isFile()) {
      zip.file(path.relative(rootDir, entryPath).split(path.sep).join('/'), await fs.readFile(entryPath));
    }
  }
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
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
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

async function createFragmentCollection(
  config: AppConfig,
  groupId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
): Promise<Record<string, unknown>> {
  const base = {
    groupId: String(groupId),
    name: collection.name,
    description: collection.description,
  };

  return postFormCandidates<Record<string, unknown>>(
    config,
    '/api/jsonws/fragment.fragmentcollection/add-fragment-collection',
    [
      {
        ...base,
        fragmentCollectionKey: collection.slug,
        serviceContext: '{}',
      },
      {
        ...base,
        fragmentCollectionKey: collection.slug,
      },
      {
        ...base,
        serviceContext: '{}',
      },
    ],
    'fragment-collection-create',
    dependencies,
  );
}

async function updateFragmentCollection(
  config: AppConfig,
  fragmentCollectionId: number,
  collection: LocalFragmentCollection,
  dependencies?: ResourceSyncDependencies,
): Promise<void> {
  if (fragmentCollectionId <= 0) {
    return;
  }

  const base = {
    fragmentCollectionId: String(fragmentCollectionId),
    name: collection.name,
    description: collection.description,
  };

  try {
    await postFormCandidates<Record<string, unknown>>(
      config,
      '/api/jsonws/fragment.fragmentcollection/update-fragment-collection',
      [
        base,
        {
          ...base,
          serviceContext: '{}',
        },
      ],
      'fragment-collection-update',
      dependencies,
    );
  } catch {
    // Legacy command ignored collection metadata update failures.
  }
}

async function createFragmentEntry(
  config: AppConfig,
  groupId: number,
  fragmentCollectionId: number,
  fragment: LocalFragment,
  dependencies?: ResourceSyncDependencies,
): Promise<Record<string, unknown>> {
  const base = fragmentEntryBaseForm(groupId, fragmentCollectionId, fragment);

  return postFormCandidates<Record<string, unknown>>(
    config,
    '/api/jsonws/fragment.fragmententry/add-fragment-entry',
    [
      {
        ...base,
        serviceContext: '{}',
        cacheable: 'false',
        readOnly: 'false',
        typeOptions: '{}',
      },
      base,
    ],
    'fragment-entry-create',
    dependencies,
  );
}

async function updateFragmentEntry(
  config: AppConfig,
  groupId: number,
  fragmentCollectionId: number,
  fragmentEntryId: number,
  fragment: LocalFragment,
  dependencies?: ResourceSyncDependencies,
): Promise<Record<string, unknown>> {
  if (fragmentEntryId <= 0) {
    throw new CliError(`fragmentEntryId invalido para ${fragment.slug}`, {
      code: 'LIFERAY_RESOURCE_ERROR',
    });
  }

  const base = {
    groupId: String(groupId),
    fragmentCollectionId: String(fragmentCollectionId),
    fragmentEntryKey: fragment.slug,
    fragmentEntryId: String(fragmentEntryId),
    name: fragment.name,
    css: fragment.css,
    html: fragment.html,
    js: fragment.js,
    configuration: fragment.configuration,
    icon: fragment.icon,
    type: String(fragment.type),
  };

  return postFormCandidates<Record<string, unknown>>(
    config,
    '/api/jsonws/fragment.fragmententry/update-fragment-entry',
    [
      {
        ...base,
        serviceContext: '{}',
        cacheable: 'false',
        readOnly: 'false',
      },
      base,
    ],
    'fragment-entry-update',
    dependencies,
  );
}

function fragmentEntryBaseForm(
  groupId: number,
  fragmentCollectionId: number,
  fragment: LocalFragment,
): Record<string, string> {
  return {
    groupId: String(groupId),
    fragmentCollectionId: String(fragmentCollectionId),
    fragmentEntryKey: fragment.slug,
    name: fragment.name,
    css: fragment.css,
    html: fragment.html,
    js: fragment.js,
    configuration: fragment.configuration,
    icon: fragment.icon,
    type: String(fragment.type),
  };
}

async function postFormCandidates<T>(
  config: AppConfig,
  apiPath: string,
  candidates: Record<string, string>[],
  operation: string,
  dependencies?: ResourceSyncDependencies,
): Promise<T> {
  const errors: string[] = [];

  for (const form of candidates) {
    const response = await authedPostForm<T>(config, apiPath, form, dependencies);
    if (response.ok) {
      return ensureJsonData(response, operation, apiPath);
    }
    errors.push(`status=${response.status} body=${response.body}`);
  }

  throw new CliError(`${operation} fallo en ${apiPath} (${errors.join(' | ')})`, {
    code: 'LIFERAY_RESOURCE_ERROR',
  });
}

function ensureJsonData<T>(response: HttpResponse<T>, operation: string, apiPath: string): T {
  if (response.data !== null) {
    return response.data;
  }

  throw new CliError(`${operation} devolvio JSON invalido en ${apiPath}`, {
    code: 'LIFERAY_RESOURCE_ERROR',
  });
}

function resolveFragmentsProjectDir(config: AppConfig, dir: string | undefined, siteToken: string): string {
  if ((dir ?? '').trim() === '') {
    return path.join(resolveFragmentsBaseDir(config), 'sites', siteToken);
  }

  const configured = path.resolve(resolveRepoPath(config, dir ?? ''));
  return fs.existsSync(path.join(configured, 'src')) ? configured : path.join(configured, siteToken);
}

async function readJsonIfExists(filePath: string): Promise<Record<string, unknown>> {
  if (!(await fs.pathExists(filePath))) {
    return {};
  }

  const raw = await fs.readFile(filePath, 'utf8');
  if (raw.trim() === '') {
    return {};
  }

  const parsed = JSON.parse(raw) as unknown;
  return isRecord(parsed) ? parsed : {};
}

async function readTextIfExists(filePath: string): Promise<string> {
  if (!(await fs.pathExists(filePath))) {
    return '';
  }

  return fs.readFile(filePath, 'utf8');
}

function sanitizeFileToken(value: string): string {
  const normalized = value
    .trim()
    .replaceAll(/[^A-Za-z0-9_.-]+/g, '_')
    .replaceAll(/_+/g, '_');
  return normalized === '' ? 'unnamed' : normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ensureText(value: unknown, fallback: string): string {
  const normalized = String(value ?? '').trim();
  return normalized === '' ? fallback : normalized;
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
