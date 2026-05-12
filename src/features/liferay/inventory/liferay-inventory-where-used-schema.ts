import {z} from 'zod';

import {
  pageEvidenceSourceSchema,
  whereUsedMatchKindSchema,
  whereUsedResourceTypeSchema,
} from './liferay-inventory-evidence-contract.js';

const whereUsedSiteOrderSchema = z.enum(['site', 'name', 'content']);

const whereUsedMatchSchema = z.object({
  resourceType: whereUsedResourceTypeSchema,
  matchedKey: z.string(),
  matchKind: whereUsedMatchKindSchema,
  label: z.string(),
  detail: z.string(),
  source: pageEvidenceSourceSchema,
});

const whereUsedPageMatchSchema = z.object({
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

export function validateWhereUsedResult(result: unknown): WhereUsedResultContract {
  return whereUsedResultSchema.parse(result);
}

export function validateWhereUsedPlanResult(result: unknown): WhereUsedPlanResultContract {
  return whereUsedPlanResultSchema.parse(result);
}
