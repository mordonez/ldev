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

export type LocalResourceCatalog = Partial<Record<PageEvidenceResourceType, Set<string>>>;

/**
 * Scans the project's own resource directories (liferay/resources/journal/structures,
 * templates, application_display templates, fragments) and collects file basenames
 * (without extension) as the set of keys the project tracks locally for each type.
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
    catalog[resourceType] = collectBasenames(absolutePath);
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

  for (const item of evidence) {
    if (!trackedTypes.includes(item.resourceType)) {
      continue;
    }
    const localKeys = catalog[item.resourceType];
    if (localKeys && !localKeys.has(item.key)) {
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
        ? `All ${evidence.length} evidence entries with a local catalog match the project's resource files.`
        : `${diffs.length} rendered resource(s) are missing from the local catalog.`,
    diffs,
  };
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
