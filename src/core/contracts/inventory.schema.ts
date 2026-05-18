import {z} from 'zod';

// ── Site / Template / Structure inventory output ───────────────────────────────

export const liferayInventorySiteSchema = z.object({
  groupId: z.number().int().positive(),
  siteFriendlyUrl: z.string(),
  name: z.string(),
  pagesCommand: z.string(),
});

export type LiferayInventorySite = z.infer<typeof liferayInventorySiteSchema>;

export const liferayInventoryTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentStructureId: z.number().int(),
  externalReferenceCode: z.string(),
  templateScript: z.string().optional(),
});

export type LiferayInventoryTemplate = z.infer<typeof liferayInventoryTemplateSchema>;

export const liferayInventoryStructureSchema = z.object({
  id: z.number().int(),
  key: z.string(),
  name: z.string(),
  templates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        externalReferenceCode: z.string(),
      }),
    )
    .optional(),
});

export type LiferayInventoryStructure = z.infer<typeof liferayInventoryStructureSchema>;

export const liferayInventorySitesSchema = z.array(liferayInventorySiteSchema);
export type LiferayInventorySites = z.infer<typeof liferayInventorySitesSchema>;

export const liferayInventoryTemplatesSchema = z.array(liferayInventoryTemplateSchema);
export type LiferayInventoryTemplates = z.infer<typeof liferayInventoryTemplatesSchema>;

export const liferayInventoryStructuresSchema = z.array(liferayInventoryStructureSchema);
export type LiferayInventoryStructures = z.infer<typeof liferayInventoryStructuresSchema>;

export const liferayInventoryStructuresResultSchema = z.object({
  sites: z.array(
    z.object({
      siteGroupId: z.number().int(),
      siteFriendlyUrl: z.string(),
      siteName: z.string(),
      structures: liferayInventoryStructuresSchema,
    }),
  ),
  summary: z.object({
    totalSites: z.number().int().nonnegative(),
    totalStructures: z.number().int().nonnegative(),
  }),
});

export type LiferayInventoryStructuresResult = z.infer<typeof liferayInventoryStructuresResultSchema>;

// ── Where-used: enum types (shared with page evidence) ────────────────────────

export const whereUsedResourceTypes = ['fragment', 'widget', 'portlet', 'structure', 'template', 'adt'] as const;

export const whereUsedMatchKinds = [
  'fragmentEntry',
  'widgetEntry',
  'widgetAdt',
  'portlet',
  'journalArticleStructure',
  'journalArticleTemplate',
  'fragmentMappedStructure',
  'fragmentMappedTemplate',
  'contentStructure',
  'displayPageArticle',
] as const;

export const pageEvidenceSourceValues = [
  'fragmentEntryLink',
  'portletLayout',
  'journalArticle',
  'renderedHtmlJournalContent',
  'contentStructure',
  'displayPageArticle',
] as const;

export const whereUsedResourceTypeSchema = z.enum(whereUsedResourceTypes);
export const whereUsedMatchKindSchema = z.enum(whereUsedMatchKinds);
export const pageEvidenceSourceSchema = z.enum(pageEvidenceSourceValues);

export type WhereUsedResourceTypeValue = (typeof whereUsedResourceTypes)[number];
export type WhereUsedMatchKindValue = (typeof whereUsedMatchKinds)[number];
export type PageEvidenceSourceValue = (typeof pageEvidenceSourceValues)[number];

// ── Where-used: output contract ────────────────────────────────────────────────

const whereUsedSiteOrderSchema = z.enum(['site', 'name', 'content']);

export const whereUsedQuerySchema = z.object({
  type: whereUsedResourceTypeSchema,
  keys: z.array(z.string()),
});

export const whereUsedMatchSchema = z.object({
  resourceType: whereUsedResourceTypeSchema,
  matchedKey: z.string(),
  matchKind: whereUsedMatchKindSchema,
  label: z.string(),
  detail: z.string(),
  source: pageEvidenceSourceSchema,
});

export const whereUsedPageMatchSchema = z.object({
  pageType: z.enum(['regularPage', 'displayPage']),
  pageName: z.string(),
  friendlyUrl: z.string(),
  fullUrl: z.string(),
  viewUrl: z.string().optional(),
  layoutId: z.number().optional(),
  plid: z.number().optional(),
  privateLayout: z.boolean(),
  hidden: z.boolean().optional(),
  editUrl: z.string().optional(),
  matches: z.array(whereUsedMatchSchema),
});

const whereUsedSiteResultSchema = z.object({
  siteFriendlyUrl: z.string(),
  siteName: z.string(),
  groupId: z.coerce.number(),
  scannedPages: z.number(),
  failedPages: z.number(),
  matchedPages: z.array(whereUsedPageMatchSchema),
  errors: z.array(z.object({fullUrl: z.string(), reason: z.string()})).optional(),
});

const whereUsedSkippedSiteSchema = z.object({
  siteFriendlyUrl: z.string(),
  groupId: z.coerce.number(),
  reason: z.string(),
});

export const whereUsedResultSchema = z.object({
  inventoryType: z.literal('whereUsed'),
  query: z.object({
    type: whereUsedResourceTypeSchema,
    keys: z.array(z.string()),
  }),
  scope: z.object({
    sites: z.array(z.string()),
    includePrivate: z.boolean(),
    concurrency: z.number(),
    maxDepth: z.number(),
    siteOrder: whereUsedSiteOrderSchema.default('site'),
    siteLimit: z.number().optional(),
    excludedSites: z.array(z.string()).default([]),
    plan: z.literal(false).default(false),
  }),
  summary: z.object({
    totalSites: z.number(),
    totalScannedPages: z.number(),
    totalMatchedPages: z.number(),
    totalMatches: z.number(),
    totalFailedPages: z.number(),
  }),
  sites: z.array(whereUsedSiteResultSchema),
  skippedSites: z.array(whereUsedSkippedSiteSchema).optional(),
});

export const whereUsedPlanResultSchema = z.object({
  inventoryType: z.literal('whereUsedPlan'),
  query: z.object({
    type: whereUsedResourceTypeSchema,
    keys: z.array(z.string()),
  }),
  scope: z.object({
    sites: z.array(z.string()),
    includePrivate: z.boolean(),
    concurrency: z.number(),
    maxDepth: z.number(),
    siteOrder: whereUsedSiteOrderSchema,
    siteLimit: z.number().optional(),
    excludedSites: z.array(z.string()),
    plan: z.literal(true),
  }),
  summary: z.object({
    totalSites: z.number(),
    selectedSites: z.number(),
    excludedSites: z.number(),
    skippedSites: z.number(),
  }),
  sites: z.array(
    z.object({
      rank: z.number(),
      siteFriendlyUrl: z.string(),
      siteName: z.string(),
      groupId: z.coerce.number(),
      structuredContents: z.number().optional(),
      selectionReason: z.enum(['explicitSite', 'siteOrder', 'contentOrder']),
    }),
  ),
  skippedSites: z.array(whereUsedSkippedSiteSchema).optional(),
});

export type WhereUsedResultContract = z.infer<typeof whereUsedResultSchema>;
export type WhereUsedPlanResultContract = z.infer<typeof whereUsedPlanResultSchema>;

// ── Where-used: derived public types ────────────────────────────────────────────
export type WhereUsedQuery = z.infer<typeof whereUsedQuerySchema>;
export type WhereUsedResourceType = WhereUsedResourceTypeValue;
export type WhereUsedMatchKind = WhereUsedMatchKindValue;
export type WhereUsedMatch = z.infer<typeof whereUsedMatchSchema>;
export type WhereUsedPageMatch = z.infer<typeof whereUsedPageMatchSchema>;
export type WhereUsedResult = WhereUsedResultContract;
export type WhereUsedPlanResult = WhereUsedPlanResultContract;
export type WhereUsedRunResult = WhereUsedResult | WhereUsedPlanResult;
