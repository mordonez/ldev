import type {runLiferayInventorySitesIncludingGlobal} from '../inventory/liferay-inventory-sites.js';
import type {runLiferayInventoryStructures} from '../inventory/liferay-inventory-structures.js';
import type {runLiferayInventoryTemplates} from '../inventory/liferay-inventory-templates.js';
import type {runLiferayInventoryWhereUsed} from '../inventory/liferay-inventory-where-used.js';
import type {ResourceDependencies} from './liferay-resource-artifact-shared.js';
import type {runLiferayResourceListAdts} from './liferay-resource-list-adts.js';
import type {runLiferayResourceListFragments} from './liferay-resource-list-fragments.js';

export const RESOURCE_PLAN_TYPES = ['structure', 'template', 'adt', 'fragment'] as const;

export type ResourcePlanResourceType = (typeof RESOURCE_PLAN_TYPES)[number];

export type ResourcePlanMatchedBy = 'key' | 'id' | 'name';

export type ResourcePlanOccurrence = {
  siteFriendlyUrl: string;
  siteName: string;
  groupId: number;
  id: string;
  key: string;
  name: string;
  matchedBy: ResourcePlanMatchedBy;
  widgetType?: string;
  collectionName?: string;
};

export type ResourcePlanUsagePage = {
  siteFriendlyUrl: string;
  pageName: string;
  fullUrl: string;
  viewUrl?: string;
  privateLayout: boolean;
  matchCount: number;
};

export type ResourcePlanUsage =
  | {
      scanned: true;
      scannedSites: string[];
      totalScannedPages: number;
      totalMatchedPages: number;
      totalFailedPages: number;
      pages: ResourcePlanUsagePage[];
    }
  | {
      scanned: false;
      reason: string;
      suggestedCommand: string;
    };

export type ResourcePlanSuggestedImport = {
  command: string;
  checkOnly: boolean;
  notes: string[];
};

export type ResourcePlanResult = {
  planType: 'resourcePlan';
  input: {
    resource: string;
    type?: ResourcePlanResourceType;
    sites?: string[];
  };
  resolved: {
    type: ResourcePlanResourceType;
    key: string;
    matchedBy: ResourcePlanMatchedBy;
  };
  owner: ResourcePlanOccurrence;
  ownerAmbiguous: boolean;
  duplicates: {
    duplicated: boolean;
    count: number;
    occurrences: ResourcePlanOccurrence[];
  };
  discovery: {
    sitesScanned: number;
    types: ResourcePlanResourceType[];
    skipped: Array<{siteFriendlyUrl: string; type: ResourcePlanResourceType; reason: string}>;
  };
  usage: ResourcePlanUsage;
  suggestedImport: ResourcePlanSuggestedImport;
  validation: {
    steps: string[];
  };
};

export type ResourcePlanOptions = {
  resource: string;
  type?: string;
  sites?: string[];
  includePrivate?: boolean;
  skipUsage?: boolean;
  siteLimit?: number;
  maxDepth?: number;
  concurrency?: number;
  pageSize?: number;
};

export type ResourcePlanPrimitives = {
  listSites: typeof runLiferayInventorySitesIncludingGlobal;
  listStructures: typeof runLiferayInventoryStructures;
  listTemplates: typeof runLiferayInventoryTemplates;
  listAdts: typeof runLiferayResourceListAdts;
  listFragments: typeof runLiferayResourceListFragments;
  whereUsed: typeof runLiferayInventoryWhereUsed;
};

export type ResourcePlanDependencies = ResourceDependencies & {
  primitives?: Partial<ResourcePlanPrimitives>;
};
