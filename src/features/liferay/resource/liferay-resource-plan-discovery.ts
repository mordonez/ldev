import type {AppConfig} from '../../../core/config/load-config.js';
import {mapConcurrent} from '../../../core/concurrency.js';
import type {LiferayInventorySite} from '../inventory/liferay-inventory-sites.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import type {
  ResourcePlanMatchedBy,
  ResourcePlanOccurrence,
  ResourcePlanPrimitives,
  ResourcePlanResourceType,
} from './liferay-resource-plan-types.js';

const DISCOVERY_CONCURRENCY = 4;

export type ResourcePlanDiscoverySkip = {
  siteFriendlyUrl: string;
  type: ResourcePlanResourceType;
  reason: string;
};

export type ResourcePlanDiscoveryResult = {
  byType: Map<ResourcePlanResourceType, ResourcePlanOccurrence[]>;
  skipped: ResourcePlanDiscoverySkip[];
};

export async function discoverOccurrences(
  config: AppConfig,
  resource: string,
  types: ResourcePlanResourceType[],
  sites: LiferayInventorySite[],
  primitives: ResourcePlanPrimitives,
  dependencies?: ResourceDependencies,
): Promise<ResourcePlanDiscoveryResult> {
  const byType = new Map<ResourcePlanResourceType, ResourcePlanOccurrence[]>();
  const skipped: ResourcePlanDiscoverySkip[] = [];

  const tasks = sites.flatMap((site) => types.map((type) => ({site, type})));
  const results = await mapConcurrent(tasks, DISCOVERY_CONCURRENCY, async ({site, type}) => {
    try {
      return {
        type,
        occurrences: await discoverOccurrencesForSite(config, resource, type, site, primitives, dependencies),
      };
    } catch (error) {
      skipped.push({
        siteFriendlyUrl: site.siteFriendlyUrl,
        type,
        reason: error instanceof Error ? error.message : String(error),
      });
      return {type, occurrences: [] as ResourcePlanOccurrence[]};
    }
  });

  for (const result of results) {
    if (result.occurrences.length === 0) {
      continue;
    }

    const rows = byType.get(result.type) ?? [];
    rows.push(...result.occurrences);
    byType.set(result.type, rows);
  }

  for (const rows of byType.values()) {
    rows.sort((left, right) => left.siteFriendlyUrl.localeCompare(right.siteFriendlyUrl));
  }

  return {byType, skipped};
}

async function discoverOccurrencesForSite(
  config: AppConfig,
  resource: string,
  type: ResourcePlanResourceType,
  site: LiferayInventorySite,
  primitives: ResourcePlanPrimitives,
  dependencies?: ResourceDependencies,
): Promise<ResourcePlanOccurrence[]> {
  const base = {
    siteFriendlyUrl: site.siteFriendlyUrl,
    siteName: site.name,
    groupId: site.groupId,
  };

  if (type === 'structure') {
    const result = await primitives.listStructures(config, {site: site.siteFriendlyUrl}, dependencies);
    return result.sites
      .flatMap((row) => row.structures)
      .flatMap((structure) => {
        const matchedBy = matchResource(resource, {
          key: structure.key,
          id: String(structure.id),
          name: structure.name,
        });
        return matchedBy
          ? [{...base, id: String(structure.id), key: structure.key, name: structure.name, matchedBy}]
          : [];
      });
  }

  if (type === 'template') {
    const templates = await primitives.listTemplates(config, {site: site.siteFriendlyUrl}, dependencies);
    return templates.flatMap((template) => {
      const matchedBy = matchResource(resource, {
        key: template.externalReferenceCode,
        id: template.id,
        name: template.name,
      });
      return matchedBy
        ? [{...base, id: template.id, key: template.externalReferenceCode, name: template.name, matchedBy}]
        : [];
    });
  }

  if (type === 'adt') {
    const adts = await primitives.listAdts(config, {site: site.siteFriendlyUrl}, dependencies);
    return adts.flatMap((adt) => {
      const matchedBy = matchResource(resource, {key: adt.templateKey, id: String(adt.templateId), name: adt.adtName});
      return matchedBy
        ? [
            {
              ...base,
              id: String(adt.templateId),
              key: adt.templateKey,
              name: adt.adtName,
              matchedBy,
              widgetType: adt.widgetType,
            },
          ]
        : [];
    });
  }

  const fragments = await primitives.listFragments(config, {site: site.siteFriendlyUrl}, dependencies);
  return fragments.flatMap((fragment) => {
    const matchedBy = matchResource(resource, {
      key: fragment.fragmentKey,
      id: String(fragment.fragmentId),
      name: fragment.fragmentName,
    });
    return matchedBy
      ? [
          {
            ...base,
            id: String(fragment.fragmentId),
            key: fragment.fragmentKey,
            name: fragment.fragmentName,
            matchedBy,
            collectionName: fragment.collectionName,
          },
        ]
      : [];
  });
}

function matchResource(
  resource: string,
  candidate: {key: string; id: string; name: string},
): ResourcePlanMatchedBy | undefined {
  const needle = resource.toLowerCase();

  if (candidate.key.toLowerCase() === needle) {
    return 'key';
  }

  if (candidate.id !== '' && candidate.id === resource) {
    return 'id';
  }

  if (candidate.name.toLowerCase() === needle) {
    return 'name';
  }

  return undefined;
}
