import fs from 'node:fs';
import path from 'node:path';

import type {ProjectContext} from '../../core/config/project-context.js';
import type {
  PageEvidence,
  PageEvidenceResourceTypeValue,
} from '../liferay/inventory/liferay-inventory-evidence-contract.js';
import type {VerifyResourceCatalogDiff, VerifyResourceCatalogResult} from './verify-page-types.js';

type PageEvidenceResourceType = PageEvidenceResourceTypeValue;

/** Evidence resourceTypes that map 1:1 to a project resource catalog directory. */
const CATALOG_RESOURCE_TYPES: readonly PageEvidenceResourceType[] = ['structure', 'template', 'adt', 'fragment'];

/** Marker file `ldev resource export-fragment(s)` writes at the root of every exported fragment directory. */
const FRAGMENT_MARKER_FILE = 'fragment.json';

/**
 * Prefix Liferay puts on a widget's `displayStyle` preference when it points at an ADT
 * (e.g. `ddmTemplate_UB_ADT_FOO`). The evidence key carries this raw value so `where-used`
 * can match on exactly what's stored in the portlet configuration; the exported ADT file
 * is named after the bare template key, so the prefix has to be stripped before comparing.
 */
const ADT_DISPLAY_STYLE_PREFIX = 'ddmTemplate_';

/**
 * Fragment key prefixes Liferay ships out of the box (e.g. the "Basic Components"
 * collection, seeded into every site). These never live under the project's own
 * fragments directory, so flagging them as "missing" would just be noise.
 */
const OOTB_FRAGMENT_KEY_PREFIXES: readonly string[] = ['BASIC_COMPONENT-'];

export type LocalResourceCatalog = Partial<Record<PageEvidenceResourceType, Set<string>>>;

/**
 * Scans the project's own resource directories (liferay/resources/journal/structures,
 * templates, application_display templates, fragments) and collects the set of keys
 * the project tracks locally for each type: file basenames (without extension) for
 * structures/templates/adts, and fragment directory names for fragments (a fragment
 * is exported as a directory of files, so its key is the directory, not any file in it).
 *
 * Returns an empty catalog entry for a resource type when its directory does not
 * exist, so callers can distinguish "project has no catalog for this type" from
 * "catalog exists but the key is missing".
 */
export function collectLocalResourceCatalog(project: ProjectContext): LocalResourceCatalog {
  const repoRoot = project.repo.root;
  if (!repoRoot) {
    return {};
  }

  const catalog: LocalResourceCatalog = {};
  const pathsByType: Partial<Record<PageEvidenceResourceType, string>> = {
    structure: project.paths.structures,
    template: project.paths.templates,
    adt: project.paths.adts,
    fragment: project.paths.fragments,
  };

  for (const resourceType of CATALOG_RESOURCE_TYPES) {
    const relativePath = pathsByType[resourceType];
    if (!relativePath) {
      continue;
    }
    const absolutePath = path.resolve(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      continue;
    }
    catalog[resourceType] =
      resourceType === 'fragment' ? collectFragmentDirectoryNames(absolutePath) : collectBasenames(absolutePath);
  }

  return catalog;
}

/**
 * Compares page evidence (what the rendered page actually uses) against the
 * project's local resource catalog. Only evidence resourceTypes with a known
 * local catalog directory are considered; everything else is ignored.
 */
export function diffEvidenceAgainstCatalog(
  evidence: PageEvidence[],
  catalog: LocalResourceCatalog,
): VerifyResourceCatalogResult {
  const trackedTypes = CATALOG_RESOURCE_TYPES.filter((resourceType) => catalog[resourceType] !== undefined);

  if (trackedTypes.length === 0) {
    return {
      status: 'skipped',
      detail: 'Project has no local resource catalog (structures/templates/adts/fragments directories not found).',
      diffs: [],
    };
  }

  const diffs: VerifyResourceCatalogDiff[] = [];
  let consideredCount = 0;

  for (const item of dropRedundantContentStructureIds(evidence)) {
    if (!trackedTypes.includes(item.resourceType)) {
      continue;
    }
    if (item.resourceType === 'fragment' && isOotbFragmentKey(item.key)) {
      continue;
    }
    consideredCount += 1;
    const localKeys = catalog[item.resourceType];
    if (localKeys && !localKeys.has(toCatalogKey(item))) {
      diffs.push({
        resourceType: item.resourceType,
        key: item.key,
        detail: `Rendered page uses ${item.resourceType} "${item.key}" which was not found in the local resource catalog.`,
      });
    }
  }

  return {
    status: diffs.length === 0 ? 'pass' : 'fail',
    detail:
      diffs.length === 0
        ? `All ${consideredCount} evidence entries with a local catalog match the project's resource files.`
        : `${diffs.length} rendered resource(s) are missing from the local catalog.`,
    diffs,
  };
}

function isOotbFragmentKey(key: string): boolean {
  return OOTB_FRAGMENT_KEY_PREFIXES.some((prefix) => key.startsWith(prefix));
}

/** Maps an evidence key to the identifier the local catalog actually stores it under. */
function toCatalogKey(item: PageEvidence): string {
  if (item.resourceType === 'adt' && item.key.startsWith(ADT_DISPLAY_STYLE_PREFIX)) {
    return item.key.slice(ADT_DISPLAY_STYLE_PREFIX.length);
  }
  return item.key;
}

/**
 * `buildContentStructureEvidence` intentionally emits both the human key and the numeric
 * contentStructureId as separate evidence entries for the same structure, so `where-used`
 * queries can match on either identifier. For the local catalog that's one physical file,
 * not two: drop the numeric-id candidate whenever a sibling entry for the same
 * contentStructureId carries the real key, so it isn't flagged as "missing" on its own.
 */
function dropRedundantContentStructureIds(evidence: PageEvidence[]): PageEvidence[] {
  const structureIdsWithKey = new Set<number>();
  for (const item of evidence) {
    if (item.resourceType === 'structure' && item.kind === 'contentStructure' && !isNumericKey(item.key)) {
      const structureId = item.context?.contentStructureId;
      if (structureId !== undefined) {
        structureIdsWithKey.add(structureId);
      }
    }
  }

  return evidence.filter((item) => {
    if (item.resourceType !== 'structure' || item.kind !== 'contentStructure' || !isNumericKey(item.key)) {
      return true;
    }
    const structureId = item.context?.contentStructureId;
    return structureId === undefined || !structureIdsWithKey.has(structureId);
  });
}

function isNumericKey(key: string): boolean {
  return /^\d+$/.test(key);
}

/**
 * Fragments are exported as a directory of files (fragment.json, configuration.json,
 * index.html/css/js), so the key is the directory name, not any file basename inside it.
 * Walks the tree and records the directory name whenever it directly contains
 * `fragment.json`, without descending into that directory's own files.
 */
function collectFragmentDirectoryNames(dir: string): Set<string> {
  const names = new Set<string>();
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, {withFileTypes: true});
    const isFragmentRoot = entries.some((entry) => entry.isFile() && entry.name === FRAGMENT_MARKER_FILE);
    if (isFragmentRoot) {
      names.add(path.basename(current));
      continue;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        stack.push(path.join(current, entry.name));
      }
    }
  }

  return names;
}

function collectBasenames(dir: string): Set<string> {
  const basenames = new Set<string>();
  const stack: string[] = [dir];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    const entries = fs.readdirSync(current, {withFileTypes: true});
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(entryPath);
      } else if (entry.isFile()) {
        basenames.add(path.parse(entry.name).name);
      }
    }
  }

  return basenames;
}
