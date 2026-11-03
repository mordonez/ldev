/**
 * Redirect entries (Liferay Redirect, JSONWS `redirect.redirectentry`), keyed by
 * (groupId, sourceURL). Verified on DXP 2026.q3.9: sourceURL is stored relative
 * to the site without a leading slash and served at /web/<site>/<sourceURL>;
 * permanent=true answers 301, false 302; a duplicate sourceURL is reported as a
 * DuplicateRedirectEntrySourceURLException in the JSONWS body.
 */

import path from 'node:path';

import fs from 'fs-extra';

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {createLiferayGateway} from '../liferay-gateway.js';
import type {ResourceDependencies} from '../resource/liferay-resource-artifact-shared.js';

const SERVICE = '/api/jsonws/redirect.redirectentry';

export type RedirectEntry = {
  redirectEntryId: number;
  sourceURL: string;
  destinationURL: string;
  permanent: boolean;
  expirationDate: string | null;
};

export type RedirectMapEntry = {sourceURL: string; destinationURL: string; permanent: boolean};

export type RedirectDependencies = ResourceDependencies;

type JsonwsRedirectEntry = {
  redirectEntryId: string | number;
  sourceURL: string;
  destinationURL: string;
  permanent: boolean | string;
  expirationDate: string | number | null;
};

/** Sources are stored relative to the site: drop leading slashes. */
export function normalizeSourceUrl(value: string): string {
  return value.trim().replace(/^\/+/, '');
}

export async function listRedirectEntries(
  config: AppConfig,
  groupId: number,
  dependencies?: RedirectDependencies,
): Promise<RedirectEntry[]> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const entries = await gateway.getJson<unknown>(
    `${SERVICE}/get-redirect-entries?groupId=${groupId}&start=-1&end=-1&-orderByComparator=`,
    'redirect-list',
  );
  return expectJsonws<JsonwsRedirectEntry[]>(entries, 'redirect-list').map(toRedirectEntry);
}

export async function addRedirectEntry(
  config: AppConfig,
  groupId: number,
  entry: RedirectMapEntry,
  dependencies?: RedirectDependencies,
): Promise<RedirectEntry> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const created = await gateway.postForm<unknown>(
    `${SERVICE}/add-redirect-entry`,
    {
      groupId: String(groupId),
      destinationURL: entry.destinationURL,
      '-expirationDate': '',
      permanent: String(entry.permanent),
      sourceURL: entry.sourceURL,
    },
    'redirect-add',
  );
  return toRedirectEntry(expectJsonws<JsonwsRedirectEntry>(created, `redirect-add ${entry.sourceURL}`));
}

export async function updateRedirectEntry(
  config: AppConfig,
  redirectEntryId: number,
  entry: RedirectMapEntry,
  dependencies?: RedirectDependencies,
): Promise<RedirectEntry> {
  const gateway = createLiferayGateway(config, dependencies?.apiClient, dependencies?.tokenClient);
  const updated = await gateway.postForm<unknown>(
    `${SERVICE}/update-redirect-entry`,
    {
      redirectEntryId: String(redirectEntryId),
      destinationURL: entry.destinationURL,
      '-expirationDate': '',
      permanent: String(entry.permanent),
      sourceURL: entry.sourceURL,
    },
    'redirect-update',
  );
  return toRedirectEntry(expectJsonws<JsonwsRedirectEntry>(updated, `redirect-update ${entry.sourceURL}`));
}

/**
 * Read a redirect map: a JSON array of {sourceURL, destinationURL, permanent?}
 * or a CSV with `source,destination[,permanent]` (header optional).
 * `permanent` defaults to true (301).
 */
export async function readRedirectMap(file: string): Promise<RedirectMapEntry[]> {
  const content = await fs.readFile(file, 'utf8');
  const rows: {source: string; destination: string; permanent: unknown}[] = [];

  if (path.extname(file).toLowerCase() === '.csv') {
    for (const [index, line] of content.split(/\r?\n/).entries()) {
      const cells = line.split(',').map((cell) => cell.trim().replace(/^"(.*)"$/, '$1'));
      if (line.trim() === '' || (index === 0 && /^source/i.test(cells[0]))) {
        continue;
      }
      rows.push({source: cells[0], destination: cells.at(1) ?? '', permanent: cells.at(2)});
    }
  } else {
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (error) {
      throw LiferayErrors.configError(`Invalid redirect map JSON in ${file}: ${String(error)}`);
    }
    if (!Array.isArray(parsed)) {
      throw LiferayErrors.configError(`${path.basename(file)} must be a JSON array of {sourceURL, destinationURL}`);
    }
    for (const item of parsed as Record<string, unknown>[]) {
      rows.push({
        source: typeof item.sourceURL === 'string' ? item.sourceURL : '',
        destination: typeof item.destinationURL === 'string' ? item.destinationURL : '',
        permanent: item.permanent,
      });
    }
  }

  return rows.map((row) => ({
    sourceURL: normalizeSourceUrl(row.source),
    destinationURL: row.destination.trim(),
    permanent: !(
      row.permanent === false ||
      ((typeof row.permanent === 'string' || typeof row.permanent === 'number') &&
        /^(false|0|302|no)$/i.test(String(row.permanent)))
    ),
  }));
}

/** JSONWS answers 200 with {exception} for service errors. */
function expectJsonws<T>(value: unknown, label: string): T {
  if (value && typeof value === 'object' && !Array.isArray(value) && 'exception' in value) {
    const exception = String((value as {exception: unknown}).exception);
    throw LiferayErrors.resourceError(`${label} failed: ${exception.split('.').at(-1) ?? exception}`, {
      details: {exception},
    });
  }
  return value as T;
}

function toRedirectEntry(entry: JsonwsRedirectEntry): RedirectEntry {
  return {
    redirectEntryId: Number(entry.redirectEntryId),
    sourceURL: entry.sourceURL,
    destinationURL: entry.destinationURL,
    permanent: entry.permanent === true || entry.permanent === 'true',
    expirationDate: entry.expirationDate === null ? null : new Date(Number(entry.expirationDate)).toISOString(),
  };
}
