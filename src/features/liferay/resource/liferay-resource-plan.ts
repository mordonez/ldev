import type {AppConfig} from '../../../core/config/load-config.js';
import type {WhereUsedResult} from '../../../core/contracts/inventory.schema.js';
import {LiferayErrors} from '../errors/index.js';
import {
  runLiferayInventorySitesIncludingGlobal,
  type LiferayInventorySite,
} from '../inventory/liferay-inventory-sites.js';
import {runLiferayInventoryStructures} from '../inventory/liferay-inventory-structures.js';
import {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import {runLiferayInventoryWhereUsed} from '../inventory/liferay-inventory-where-used.js';
import {normalizeFriendlyUrl} from '../portal/site-resolution.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import {discoverOccurrences} from './liferay-resource-plan-discovery.js';
import {buildSuggestedImport, buildValidationSteps, buildWhereUsedCommand} from './liferay-resource-plan-suggest.js';
import {
  RESOURCE_PLAN_TYPES,
  type ResourcePlanDependencies,
  type ResourcePlanOccurrence,
  type ResourcePlanOptions,
  type ResourcePlanPrimitives,
  type ResourcePlanResourceType,
  type ResourcePlanResult,
  type ResourcePlanUsage,
} from './liferay-resource-plan-types.js';
import {runLiferayResourceListAdts} from './liferay-resource-list-adts.js';
import {runLiferayResourceListFragments} from './liferay-resource-list-fragments.js';

export {formatLiferayResourcePlan} from './liferay-resource-plan-format.js';
export type {ResourcePlanDiscoverySkip} from './liferay-resource-plan-discovery.js';
export {
  RESOURCE_PLAN_TYPES,
  type ResourcePlanDependencies,
  type ResourcePlanMatchedBy,
  type ResourcePlanOccurrence,
  type ResourcePlanOptions,
  type ResourcePlanPrimitives,
  type ResourcePlanResourceType,
  type ResourcePlanResult,
  type ResourcePlanSuggestedImport,
  type ResourcePlanUsage,
  type ResourcePlanUsagePage,
} from './liferay-resource-plan-types.js';

const DEFAULT_PRIMITIVES: ResourcePlanPrimitives = {
  listSites: runLiferayInventorySitesIncludingGlobal,
  listStructures: runLiferayInventoryStructures,
  listTemplates: runLiferayInventoryTemplates,
  listAdts: runLiferayResourceListAdts,
  listFragments: runLiferayResourceListFragments,
  whereUsed: runLiferayInventoryWhereUsed,
};

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runLiferayResourcePlan(
  config: AppConfig,
  options: ResourcePlanOptions,
  dependencies?: ResourcePlanDependencies,
): Promise<ResourcePlanResult> {
  const resource = options.resource.trim();
  if (resource === '') {
    throw LiferayErrors.configError('plan requires a non-empty resource id or key.');
  }

  const requestedType = validatePlanType(options.type);
  const primitives: ResourcePlanPrimitives = {...DEFAULT_PRIMITIVES, ...dependencies?.primitives};
  const types: ResourcePlanResourceType[] = requestedType ? [requestedType] : [...RESOURCE_PLAN_TYPES];

  const sites = await selectPlanSites(config, options, primitives, dependencies);
  const discovery = await discoverOccurrences(config, resource, types, sites, primitives, dependencies);
  const resolvedType = resolveSingleType(resource, requestedType, discovery.byType, sites);
  const occurrences = discovery.byType.get(resolvedType) ?? [];
  const owner = selectOwner(occurrences);
  const ownerAmbiguous = occurrences.length > 1;
  const usage = await collectUsage(config, resolvedType, owner.key, options, primitives, dependencies);
  const suggestedImport = buildSuggestedImport(resolvedType, owner, occurrences);

  return {
    planType: 'resourcePlan',
    input: {
      resource,
      ...(requestedType ? {type: requestedType} : {}),
      ...(options.sites && options.sites.length > 0 ? {sites: options.sites} : {}),
    },
    resolved: {
      type: resolvedType,
      key: owner.key,
      matchedBy: owner.matchedBy,
    },
    owner,
    ownerAmbiguous,
    duplicates: {
      duplicated: occurrences.length > 1,
      count: occurrences.length,
      occurrences,
    },
    discovery: {
      sitesScanned: sites.length,
      types,
      skipped: discovery.skipped,
    },
    usage,
    suggestedImport,
    validation: {
      steps: buildValidationSteps(resolvedType, owner, suggestedImport, options),
    },
  };
}

// ── Validation ────────────────────────────────────────────────────────────────

function validatePlanType(type: string | undefined): ResourcePlanResourceType | undefined {
  if (type === undefined || type.trim() === '') {
    return undefined;
  }

  const normalized = type.trim().toLowerCase();
  if ((RESOURCE_PLAN_TYPES as readonly string[]).includes(normalized)) {
    return normalized as ResourcePlanResourceType;
  }

  throw LiferayErrors.configError(`--type must be one of: ${RESOURCE_PLAN_TYPES.join(', ')}.`);
}

async function selectPlanSites(
  config: AppConfig,
  options: ResourcePlanOptions,
  primitives: ResourcePlanPrimitives,
  dependencies?: ResourceDependencies,
): Promise<LiferayInventorySite[]> {
  const sites = await primitives.listSites(config, {pageSize: options.pageSize ?? 200}, dependencies);

  if (!options.sites || options.sites.length === 0) {
    return sites;
  }

  const selected: LiferayInventorySite[] = [];
  for (const requested of options.sites) {
    const trimmed = requested.trim();
    const match = sites.find(
      (site) => site.siteFriendlyUrl === normalizeFriendlyUrl(trimmed) || String(site.groupId) === trimmed,
    );

    if (!match) {
      throw LiferayErrors.siteNotFound(requested);
    }

    if (!selected.some((site) => site.groupId === match.groupId)) {
      selected.push(match);
    }
  }

  return selected;
}

function resolveSingleType(
  resource: string,
  requestedType: ResourcePlanResourceType | undefined,
  byType: Map<ResourcePlanResourceType, ResourcePlanOccurrence[]>,
  sites: LiferayInventorySite[],
): ResourcePlanResourceType {
  const matchedTypes = [...byType.keys()];

  if (matchedTypes.length === 0) {
    const scope = sites.length === 1 ? `site ${sites[0].siteFriendlyUrl}` : `${sites.length} accessible sites`;
    throw LiferayErrors.resourceError(
      `Resource '${resource}' was not found as ${requestedType ?? RESOURCE_PLAN_TYPES.join('|')} in ${scope}. ` +
        'Check the key with: ldev portal inventory structures --all-sites, ldev portal inventory templates, ' +
        'ldev resource adts, or ldev resource fragments.',
    );
  }

  if (matchedTypes.length > 1) {
    throw LiferayErrors.configError(
      `Resource '${resource}' is ambiguous: it matches ${matchedTypes.join(' and ')}. Re-run with --type <type>.`,
    );
  }

  return matchedTypes[0];
}

function selectOwner(occurrences: ResourcePlanOccurrence[]): ResourcePlanOccurrence {
  const global = occurrences.find((occurrence) => occurrence.siteFriendlyUrl === '/global');
  return global ?? occurrences[0];
}

// ── Usage (where-used) ────────────────────────────────────────────────────────

async function collectUsage(
  config: AppConfig,
  type: ResourcePlanResourceType,
  key: string,
  options: ResourcePlanOptions,
  primitives: ResourcePlanPrimitives,
  dependencies?: ResourceDependencies,
): Promise<ResourcePlanUsage> {
  const suggestedCommand = buildWhereUsedCommand(type, key, options.sites);

  if (options.skipUsage) {
    return {scanned: false, reason: 'Usage scan skipped (--skip-usage).', suggestedCommand};
  }

  try {
    const result = await primitives.whereUsed(
      config,
      {
        type,
        keys: [key],
        ...(options.sites && options.sites.length > 0 ? {sites: options.sites} : {}),
        includePrivate: Boolean(options.includePrivate),
        ...(options.siteLimit !== undefined ? {siteLimit: options.siteLimit} : {}),
        ...(options.maxDepth !== undefined ? {maxDepth: options.maxDepth} : {}),
        ...(options.concurrency !== undefined ? {concurrency: options.concurrency} : {}),
        ...(options.pageSize !== undefined ? {pageSize: options.pageSize} : {}),
      },
      dependencies,
    );

    if (result.inventoryType !== 'whereUsed') {
      return {scanned: false, reason: 'Usage scan returned a plan instead of results.', suggestedCommand};
    }

    return summarizeUsage(result);
  } catch (error) {
    return {
      scanned: false,
      reason: `Usage scan failed: ${error instanceof Error ? error.message : String(error)}`,
      suggestedCommand,
    };
  }
}

function summarizeUsage(result: WhereUsedResult): ResourcePlanUsage {
  const pages = result.sites.flatMap((site) =>
    site.matchedPages.map((page) => ({
      siteFriendlyUrl: site.siteFriendlyUrl,
      pageName: page.pageName,
      fullUrl: page.fullUrl,
      ...(page.viewUrl !== undefined ? {viewUrl: page.viewUrl} : {}),
      privateLayout: page.privateLayout,
      matchCount: page.matches.length,
    })),
  );

  return {
    scanned: true,
    scannedSites: result.scope.sites,
    totalScannedPages: result.summary.totalScannedPages,
    totalMatchedPages: result.summary.totalMatchedPages,
    totalFailedPages: result.summary.totalFailedPages,
    pages,
  };
}
