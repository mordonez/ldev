/**
 * Central export point for all Zod schemas and inferred types.
 * Organized by surface: shared, inventory, resource.
 */

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
} from './inventory.schema.js';

export type {
  LiferayInventorySite,
  LiferayInventoryTemplate,
  LiferayInventoryStructure,
  LiferayInventorySites,
  LiferayInventoryTemplates,
  LiferayInventoryStructures,
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
