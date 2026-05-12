// Shared schemas (used by both inventory and resource)
export {
  resolvedSiteSchema,
  siteLookupPayloadSchema,
  headlessPageSchema,
  headlessSiteSchema,
  dataDefinitionSchema,
  contentTemplateSchema,
  jsonwsCompanySchema,
  jsonwsGroupSearchResultSchema,
} from './shared.schema.js';

export type {
  ResolvedSite,
  SiteLookupPayload,
  HeadlessPage,
  HeadlessSite,
  DataDefinition,
  ContentTemplate,
  JsonwsCompany,
  JsonwsGroupSearchResult,
} from './shared.schema.js';

// Inventory schemas
export {
  liferayInventorySiteSchema,
  liferayInventoryTemplateSchema,
  liferayInventoryStructureSchema,
  liferayInventorySitesSchema,
  liferayInventoryTemplatesSchema,
  liferayInventoryStructuresSchema,
  whereUsedResourceTypes,
  whereUsedMatchKinds,
  pageEvidenceSourceValues,
  whereUsedResourceTypeSchema,
  whereUsedMatchKindSchema,
  pageEvidenceSourceSchema,
  whereUsedQuerySchema,
  whereUsedMatchSchema,
  whereUsedPageMatchSchema,
  whereUsedResultSchema,
  whereUsedPlanResultSchema,
} from './inventory.schema.js';

export type {
  LiferayInventorySite,
  LiferayInventoryTemplate,
  LiferayInventoryStructure,
  LiferayInventorySites,
  LiferayInventoryTemplates,
  LiferayInventoryStructures,
  WhereUsedResourceTypeValue,
  WhereUsedMatchKindValue,
  PageEvidenceSourceValue,
  WhereUsedQuery,
  WhereUsedResourceType,
  WhereUsedMatchKind,
  WhereUsedMatch,
  WhereUsedPageMatch,
  WhereUsedResultContract,
  WhereUsedPlanResultContract,
  WhereUsedResult,
  WhereUsedPlanResult,
  WhereUsedRunResult,
} from './inventory.schema.js';

// Resource schemas
export {
  liferayResourceSyncFragmentItemResultSchema,
  liferayResourceSyncFragmentsSingleResultSchema,
  liferayResourceSyncFragmentsAllSitesResultSchema,
  liferayResourceSyncFragmentsResultSchema,
  liferayResourceImportFailureSchema,
  liferayResourceSyncAdtItemResultSchema,
  liferayResourceSyncStructureItemResultSchema,
  liferayResourceSyncTemplateItemResultSchema,
} from './resource.schema.js';

export type {
  LiferayResourceSyncFragmentItemResult,
  LiferayResourceSyncFragmentsSingleResult,
  LiferayResourceSyncFragmentsAllSitesResult,
  LiferayResourceSyncFragmentsResult,
  LiferayResourceImportFailure,
  LiferayResourceSyncAdtItemResult,
  LiferayResourceSyncStructureItemResult,
  LiferayResourceSyncTemplateItemResult,
} from './resource.schema.js';
