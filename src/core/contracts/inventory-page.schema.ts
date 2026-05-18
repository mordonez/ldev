import {z} from 'zod';

import {pageEvidenceSourceSchema} from './inventory.schema.js';

export const pageEvidenceResourceTypes = [
  'fragment',
  'widget',
  'portlet',
  'structure',
  'template',
  'adt',
  'journalArticle',
] as const;

export const pageEvidenceKinds = [
  'fragmentEntry',
  'widgetEntry',
  'widgetAdt',
  'portlet',
  'journalArticle',
  'journalArticleStructure',
  'journalArticleTemplate',
  'fragmentMappedStructure',
  'fragmentMappedTemplate',
  'contentStructure',
  'displayPageArticle',
] as const;

export const pageEvidenceResourceTypeSchema = z.enum(pageEvidenceResourceTypes);
export const pageEvidenceKindSchema = z.enum(pageEvidenceKinds);

export type PageEvidenceResourceTypeValue = (typeof pageEvidenceResourceTypes)[number];
export type PageEvidenceKindValue = (typeof pageEvidenceKinds)[number];

export const pageEvidenceContextSchema = z
  .object({
    articleId: z.string().optional(),
    articleTitle: z.string().optional(),
    contentStructureId: z.number().optional(),
    contentStructureName: z.string().optional(),
  })
  .optional();

export type PageEvidenceContext = NonNullable<z.infer<typeof pageEvidenceContextSchema>>;

export const pageEvidenceSchema = z.object({
  resourceType: pageEvidenceResourceTypeSchema,
  key: z.string(),
  kind: pageEvidenceKindSchema,
  detail: z.string(),
  source: pageEvidenceSourceSchema,
  context: pageEvidenceContextSchema,
});

export type PageEvidence = z.infer<typeof pageEvidenceSchema>;

const liferayInventoryPagesNodeSchema: z.ZodType<{
  pageType: 'regularPage';
  pageSubtype: string;
  name: string;
  friendlyUrl: string;
  fullUrl: string;
  pageCommand: string;
  layoutId: number;
  plid: number;
  hidden: boolean;
  targetUrl?: string;
  children: Array<z.infer<typeof liferayInventoryPagesNodeSchema>>;
}> = z.lazy(() =>
  z.object({
    pageType: z.literal('regularPage'),
    pageSubtype: z.string(),
    name: z.string(),
    friendlyUrl: z.string(),
    fullUrl: z.string(),
    pageCommand: z.string(),
    layoutId: z.number(),
    plid: z.number(),
    hidden: z.boolean(),
    targetUrl: z.string().optional(),
    children: z.array(liferayInventoryPagesNodeSchema),
  }),
);

export const liferayInventoryPagesResultSchema = z.object({
  inventoryType: z.literal('pages'),
  groupId: z.number(),
  siteName: z.string(),
  siteFriendlyUrl: z.string(),
  privateLayout: z.boolean(),
  sitePathPrefix: z.string(),
  inspectCommandTemplate: z.string(),
  pageCount: z.number().int().nonnegative(),
  pages: z.array(liferayInventoryPagesNodeSchema),
});

export type LiferayInventoryPagesResult = z.infer<typeof liferayInventoryPagesResultSchema>;
