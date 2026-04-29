import {z} from 'zod';

import {
  pageEvidenceSourceSchema,
  whereUsedMatchKindSchema,
  whereUsedResourceTypeSchema,
} from './liferay-inventory-evidence-contract.js';

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
  }),
  summary: z.object({
    totalSites: z.number(),
    totalScannedPages: z.number(),
    totalMatchedPages: z.number(),
    totalMatches: z.number(),
    totalFailedPages: z.number(),
  }),
  sites: z.array(whereUsedSiteResultSchema),
});

export type WhereUsedResultContract = z.infer<typeof whereUsedResultSchema>;

export function validateWhereUsedResult(result: unknown): WhereUsedResultContract {
  return whereUsedResultSchema.parse(result);
}
