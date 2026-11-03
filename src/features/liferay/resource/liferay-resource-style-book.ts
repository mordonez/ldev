/**
 * Style Books as files, keyed by ERC, over JSONWS `stylebook.stylebookentry`.
 *
 * The headless-admin-site style-book endpoints answer UnsupportedOperationException
 * on DXP 2026.q3 unless feature flag LPD-35443 is enabled (a release flag, not
 * supported in production), so this uses JSONWS, which works without it.
 * Company-wide style books live in /global, the default site.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import {resolveBasePath, resolveSiteToken, sanitizeArtifactToken} from '../portal/artifact-paths.js';
import {resolveSite} from '../portal/site-resolution.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';

const SERVICE = '/api/jsonws/stylebook.stylebookentry';
const STYLE_BOOKS_DIR = 'liferay/resources/style-books';

export type StyleBookFile = {
  externalReferenceCode: string;
  name: string;
  styleBookEntryKey: string;
  themeId: string;
  frontendTokensValues: Record<string, unknown>;
};

type JsonwsStyleBook = {
  styleBookEntryId: string | number;
  externalReferenceCode: string;
  name: string;
  styleBookEntryKey: string;
  themeId: string;
  frontendTokensValues: string;
};

export type StyleBookChange = {kind: 'add' | 'change' | 'remove'; path: string};

export type LiferayStyleBookImportResult = {
  status: 'checked' | 'checked_missing' | 'created' | 'updated';
  externalReferenceCode: string;
  siteFriendlyUrl: string;
  file: string;
  changes: StyleBookChange[];
};

export async function runLiferayResourceGetStyleBook(
  config: AppConfig,
  options: {site?: string; id: string},
  dependencies?: ResourceDependencies,
): Promise<StyleBookFile & {styleBookEntryId: number; siteFriendlyUrl: string}> {
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const entry = await findStyleBook(config, site.id, options.id, dependencies);
  if (!entry) {
    throw LiferayErrors.resourceError(`Style book not found in ${site.friendlyUrlPath}: ${options.id}`);
  }
  return {...toFile(entry), styleBookEntryId: Number(entry.styleBookEntryId), siteFriendlyUrl: site.friendlyUrlPath};
}

export async function runLiferayResourceExportStyleBook(
  config: AppConfig,
  options: {site?: string; id: string; output?: string},
  dependencies?: ResourceDependencies,
): Promise<{outputPath: string}> {
  const styleBook = await runLiferayResourceGetStyleBook(config, options, dependencies);
  const outputPath = path.resolve(
    options.output ?? defaultStyleBookFile(config, styleBook.siteFriendlyUrl, styleBook.externalReferenceCode),
  );
  await fs.outputFile(outputPath, `${JSON.stringify(toFile(styleBook), null, 2)}\n`);
  return {outputPath};
}

export async function runLiferayResourceImportStyleBook(
  config: AppConfig,
  options: {site?: string; key?: string; file?: string; checkOnly?: boolean; createMissing?: boolean},
  dependencies?: ResourceDependencies,
): Promise<LiferayStyleBookImportResult> {
  const site = await resolveSite(config, options.site ?? '/global', dependencies);
  const file = await resolveStyleBookFile(config, site.friendlyUrlPath, options.key, options.file);
  const local = await readStyleBookFile(file);
  if (options.key && options.key !== local.externalReferenceCode) {
    throw LiferayErrors.resourceError(
      `--style-book '${options.key}' does not match externalReferenceCode '${local.externalReferenceCode}' in ${file}`,
    );
  }

  const remote = await findStyleBook(config, site.id, local.externalReferenceCode, dependencies);
  const base = {externalReferenceCode: local.externalReferenceCode, siteFriendlyUrl: site.friendlyUrlPath, file};
  if (!remote && !options.createMissing) {
    throw LiferayErrors.resourceError(
      `Style book '${local.externalReferenceCode}' does not exist in ${site.friendlyUrlPath} and create-missing is not enabled.`,
    );
  }

  const changes = remote
    ? diffStyleBook(local, toFile(remote))
    : [{kind: 'add' as const, path: local.externalReferenceCode}];
  if (options.checkOnly) {
    return {...base, status: remote ? 'checked' : 'checked_missing', changes};
  }

  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const tokens = JSON.stringify(local.frontendTokensValues);
  if (!remote) {
    expectJsonws(
      await gateway.postForm<unknown>(
        `${SERVICE}/add-style-book-entry`,
        {
          externalReferenceCode: local.externalReferenceCode,
          groupId: String(site.id),
          frontendTokensValues: tokens,
          name: local.name,
          styleBookEntryKey: local.styleBookEntryKey,
          themeId: local.themeId,
        },
        'style-book-add',
      ),
      'style-book-add',
    );
  } else {
    const id = String(remote.styleBookEntryId);
    if (changes.some((change) => change.path.startsWith('frontendTokensValues'))) {
      expectJsonws(
        await gateway.postForm<unknown>(
          `${SERVICE}/update-frontend-tokens-values`,
          {styleBookEntryId: id, frontendTokensValues: tokens},
          'style-book-update-tokens',
        ),
        'style-book-update-tokens',
      );
    }
    if (changes.some((change) => change.path === 'name')) {
      expectJsonws(
        await gateway.postForm<unknown>(
          `${SERVICE}/update-name`,
          {styleBookEntryId: id, name: local.name},
          'style-book-update-name',
        ),
        'style-book-update-name',
      );
    }
  }

  const after = await findStyleBook(config, site.id, local.externalReferenceCode, dependencies);
  const pending = after ? diffStyleBook(local, toFile(after)).filter((change) => change.path !== 'themeId') : changes;
  if (pending.length > 0) {
    throw LiferayErrors.resourceError(
      `Read-back mismatch for style book '${local.externalReferenceCode}': ${pending.map((c) => `${c.kind} ${c.path}`).join(', ')}`,
      {details: {...base, pending}},
    );
  }
  return {...base, status: remote ? 'updated' : 'created', changes};
}

/** Token-level diff: local is authoritative for every token it declares; remote-only tokens are `remove`. */
export function diffStyleBook(local: StyleBookFile, remote: StyleBookFile): StyleBookChange[] {
  const changes: StyleBookChange[] = [];
  for (const key of ['name', 'styleBookEntryKey', 'themeId'] as const) {
    if (local[key] !== remote[key]) {
      changes.push({kind: 'change', path: key});
    }
  }
  const remoteTokens = remote.frontendTokensValues;
  for (const [token, value] of Object.entries(local.frontendTokensValues)) {
    if (!(token in remoteTokens)) {
      changes.push({kind: 'add', path: `frontendTokensValues.${token}`});
    } else if (JSON.stringify(value) !== JSON.stringify(remoteTokens[token])) {
      changes.push({kind: 'change', path: `frontendTokensValues.${token}`});
    }
  }
  for (const token of Object.keys(remoteTokens)) {
    if (!(token in local.frontendTokensValues)) {
      changes.push({kind: 'remove', path: `frontendTokensValues.${token}`});
    }
  }
  return changes;
}

export function formatLiferayStyleBook(result: StyleBookFile & {siteFriendlyUrl: string}): string {
  return [
    'RESOURCE_STYLE_BOOK',
    `externalReferenceCode=${result.externalReferenceCode}`,
    `name=${result.name}`,
    `key=${result.styleBookEntryKey}`,
    `themeId=${result.themeId}`,
    `site=${result.siteFriendlyUrl}`,
    `tokens=${Object.keys(result.frontendTokensValues).join(',')}`,
  ].join('\n');
}

export function formatLiferayStyleBookImport(result: LiferayStyleBookImportResult): string {
  return [
    `${result.status}\t${result.externalReferenceCode}\tsite=${result.siteFriendlyUrl}`,
    `file=${result.file}`,
    ...(result.changes.length === 0 ? ['changes=none'] : result.changes.map((c) => `${c.kind}\t${c.path}`)),
  ].join('\n');
}

async function findStyleBook(
  config: AppConfig,
  groupId: number,
  id: string,
  dependencies?: ResourceDependencies,
): Promise<JsonwsStyleBook | null> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const entries = expectJsonws<JsonwsStyleBook[]>(
    await gateway.getJson<unknown>(
      `${SERVICE}/get-style-book-entries?groupId=${groupId}&start=-1&end=-1&-orderByComparator=`,
      'style-book-list',
    ),
    'style-book-list',
  );
  return (
    entries.find(
      (entry) =>
        entry.externalReferenceCode === id ||
        entry.styleBookEntryKey === id ||
        String(entry.styleBookEntryId) === id ||
        entry.name === id,
    ) ?? null
  );
}

function toFile(entry: JsonwsStyleBook | StyleBookFile): StyleBookFile {
  const tokens =
    typeof entry.frontendTokensValues === 'string'
      ? (JSON.parse(entry.frontendTokensValues || '{}') as Record<string, unknown>)
      : entry.frontendTokensValues;
  return {
    externalReferenceCode: entry.externalReferenceCode,
    name: entry.name,
    styleBookEntryKey: entry.styleBookEntryKey,
    themeId: entry.themeId,
    frontendTokensValues: Object.fromEntries(
      Object.keys(tokens)
        .sort()
        .map((key) => [key, tokens[key]]),
    ),
  };
}

function defaultStyleBookFile(config: AppConfig, siteFriendlyUrl: string, erc: string): string {
  return path.join(
    resolveBasePath(config, STYLE_BOOKS_DIR),
    resolveSiteToken(siteFriendlyUrl),
    `${sanitizeArtifactToken(erc)}.json`,
  );
}

async function resolveStyleBookFile(
  config: AppConfig,
  siteFriendlyUrl: string,
  key: string | undefined,
  file: string | undefined,
): Promise<string> {
  const candidate = file?.trim()
    ? path.resolve(config.repoRoot ?? config.cwd, file)
    : key
      ? defaultStyleBookFile(config, siteFriendlyUrl, key)
      : null;
  if (!candidate) {
    throw LiferayErrors.configError('import-style-book requires --style-book or --file');
  }
  if (!(await fs.pathExists(candidate))) {
    throw LiferayErrors.resourceFileNotFound(candidate);
  }
  return candidate;
}

async function readStyleBookFile(file: string): Promise<StyleBookFile> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, 'utf8'));
  } catch (error) {
    throw LiferayErrors.resourceError(`Invalid style book JSON in ${file}: ${String(error)}`);
  }
  const value = (parsed ?? {}) as Partial<Record<keyof StyleBookFile, unknown>>;
  const missing: string[] = (['externalReferenceCode', 'name', 'styleBookEntryKey', 'themeId'] as const).filter(
    (key) => typeof value[key] !== 'string' || value[key] === '',
  );
  if (!value.frontendTokensValues || typeof value.frontendTokensValues !== 'object') {
    missing.push('frontendTokensValues');
  }
  if (missing.length > 0) {
    throw LiferayErrors.resourceError(
      `Style book file ${file} needs ${missing.join(', ')} (themeId e.g. classic_WAR_classictheme)`,
    );
  }
  return toFile(value as unknown as StyleBookFile);
}

/** JSONWS answers 200 with {exception} for service errors. */
function expectJsonws<T>(value: unknown, label: string): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'exception' in value) {
    throw LiferayErrors.resourceError(`${label} failed: ${String((value as {exception: unknown}).exception)}`);
  }
  return value as T;
}
