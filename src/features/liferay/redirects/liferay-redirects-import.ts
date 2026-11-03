/**
 * `ldev resource import-redirects`: apply a redirect map (e.g. the 301 map a
 * migrator generates) to one site, keyed by (groupId, sourceURL), and prove it
 * by read-back and optionally by HTTP. Remote-only redirects are reported, never
 * deleted.
 */

import type {AppConfig} from '../../../core/config/load-config.js';
import {LiferayErrors} from '../errors/index.js';
import {resolveSite} from '../portal/site-resolution.js';
import {
  addRedirectEntry,
  listRedirectEntries,
  readRedirectMap,
  updateRedirectEntry,
  type RedirectDependencies,
  type RedirectEntry,
  type RedirectMapEntry,
} from './liferay-redirects-shared.js';

export type RedirectProbe = {sourceURL: string; status: number; location: string | null; ok: boolean};

export type LiferayRedirectsImportResult = {
  status: 'checked' | 'applied';
  groupId: number;
  siteFriendlyUrl: string;
  file: string;
  create: string[];
  update: string[];
  unchanged: string[];
  /** Redirects in the site that the map does not mention; left untouched. */
  remoteOnly: string[];
  probes: RedirectProbe[] | null;
};

type ImportDependencies = RedirectDependencies & {fetch?: typeof fetch};

export async function runLiferayRedirectsImport(
  config: AppConfig,
  options: {site: string; file: string; checkOnly?: boolean; probe?: boolean},
  dependencies?: ImportDependencies,
): Promise<LiferayRedirectsImportResult> {
  const map = await readRedirectMap(options.file);
  validateRedirectMap(map, options.file);

  const site = await resolveSite(config, options.site, dependencies);
  const remote = new Map((await listRedirectEntries(config, site.id, dependencies)).map((e) => [e.sourceURL, e]));
  const plan = planRedirects(map, remote);
  const base = {
    groupId: site.id,
    siteFriendlyUrl: site.friendlyUrlPath,
    file: options.file,
    create: plan.create.map((entry) => entry.sourceURL),
    update: plan.update.map(({entry}) => entry.sourceURL),
    unchanged: plan.unchanged,
    remoteOnly: [...remote.keys()].filter((source) => !map.some((entry) => entry.sourceURL === source)).sort(),
  };

  if (options.checkOnly) {
    return {...base, status: 'checked', probes: null};
  }

  for (const entry of plan.create) {
    await addRedirectEntry(config, site.id, entry, dependencies);
  }
  for (const {entry, redirectEntryId} of plan.update) {
    await updateRedirectEntry(config, redirectEntryId, entry, dependencies);
  }

  const after = new Map((await listRedirectEntries(config, site.id, dependencies)).map((e) => [e.sourceURL, e]));
  const pending = map.filter((entry) => !matches(entry, after.get(entry.sourceURL))).map((entry) => entry.sourceURL);
  if (pending.length > 0) {
    throw LiferayErrors.resourceError(`Read-back mismatch for redirects: ${pending.join(', ')}`, {
      details: {...base, pending},
    });
  }

  const probes = options.probe ? await probeRedirects(config, site.friendlyUrlPath, map, dependencies?.fetch) : null;
  const failedProbes = probes?.filter((probe) => !probe.ok) ?? [];
  if (failedProbes.length > 0) {
    throw LiferayErrors.resourceError(
      `Redirects stored but not served as expected: ${failedProbes.map((probe) => `/${probe.sourceURL} -> ${probe.status} ${probe.location ?? ''}`).join('; ')}`,
      {details: {...base, probes}},
    );
  }

  return {...base, status: 'applied', probes};
}

export function formatLiferayRedirectsImport(result: LiferayRedirectsImportResult): string {
  return [
    `${result.status}\tredirects site=${result.siteFriendlyUrl} groupId=${result.groupId}`,
    `create=${result.create.length} update=${result.update.length} unchanged=${result.unchanged.length} remoteOnly=${result.remoteOnly.length}`,
    ...result.create.map((source) => `create\t/${source}`),
    ...result.update.map((source) => `update\t/${source}`),
    ...(result.probes ? [`probes ok=${result.probes.filter((probe) => probe.ok).length}/${result.probes.length}`] : []),
  ].join('\n');
}

function validateRedirectMap(map: RedirectMapEntry[], file: string): void {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const entry of map) {
    if (entry.sourceURL === '' || entry.destinationURL === '') {
      problems.push(`empty source or destination (${entry.sourceURL || '?'} -> ${entry.destinationURL || '?'})`);
    } else if (seen.has(entry.sourceURL)) {
      problems.push(`duplicate source /${entry.sourceURL}`);
    } else if (entry.destinationURL.replace(/^\/+/, '').endsWith(entry.sourceURL)) {
      problems.push(`/${entry.sourceURL} redirects to itself`);
    }
    seen.add(entry.sourceURL);
  }
  if (problems.length > 0) {
    throw LiferayErrors.configError(`Invalid redirect map ${file}: ${problems.join('; ')}`, {details: {problems}});
  }
}

function planRedirects(map: RedirectMapEntry[], remote: Map<string, RedirectEntry>) {
  const create: RedirectMapEntry[] = [];
  const update: {entry: RedirectMapEntry; redirectEntryId: number}[] = [];
  const unchanged: string[] = [];
  for (const entry of map) {
    const existing = remote.get(entry.sourceURL);
    if (!existing) {
      create.push(entry);
    } else if (matches(entry, existing)) {
      unchanged.push(entry.sourceURL);
    } else {
      update.push({entry, redirectEntryId: existing.redirectEntryId});
    }
  }
  return {create, update, unchanged};
}

function matches(entry: RedirectMapEntry, remote: RedirectEntry | undefined): boolean {
  return remote !== undefined && remote.destinationURL === entry.destinationURL && remote.permanent === entry.permanent;
}

/** GET /web/<site>/<source> without following redirects: 301/302 to the destination. */
async function probeRedirects(
  config: AppConfig,
  siteFriendlyUrl: string,
  map: RedirectMapEntry[],
  fetchImpl: typeof fetch = fetch,
): Promise<RedirectProbe[]> {
  const base = config.liferay.url.replace(/\/+$/, '');
  const probes: RedirectProbe[] = [];
  for (const entry of map) {
    const response = await fetchImpl(`${base}/web${siteFriendlyUrl}/${entry.sourceURL}`, {redirect: 'manual'});
    const location = response.headers.get('location');
    probes.push({
      sourceURL: entry.sourceURL,
      status: response.status,
      location,
      ok: response.status === (entry.permanent ? 301 : 302) && (location ?? '').endsWith(entry.destinationURL),
    });
  }
  return probes;
}
