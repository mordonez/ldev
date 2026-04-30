import {z} from 'zod';

export type PageEvidenceContext = {
  articleId?: string;
  articleTitle?: string;
  contentStructureId?: number;
  contentStructureName?: string;
};

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
  'contentStructure',
  'displayPageArticle',
] as const;

export type PageEvidenceResourceTypeValue = (typeof pageEvidenceResourceTypes)[number];
export type PageEvidenceKindValue = (typeof pageEvidenceKinds)[number];
export type WhereUsedResourceTypeValue = (typeof whereUsedResourceTypes)[number];
export type WhereUsedMatchKindValue = (typeof whereUsedMatchKinds)[number];
export type PageEvidenceSourceValue = (typeof pageEvidenceSourceValues)[number];

export const pageEvidenceResourceTypeSchema = z.enum(pageEvidenceResourceTypes);
export const pageEvidenceKindSchema = z.enum(pageEvidenceKinds);
export const whereUsedResourceTypeSchema = z.enum(whereUsedResourceTypes);
export const whereUsedMatchKindSchema = z.enum(whereUsedMatchKinds);
export const pageEvidenceSourceSchema = z.enum(pageEvidenceSourceValues);

export const pageEvidenceContextSchema = z
  .object({
    articleId: z.string().optional(),
    articleTitle: z.string().optional(),
    contentStructureId: z.number().optional(),
    contentStructureName: z.string().optional(),
  })
  .optional();

export const pageEvidenceSchema = z.object({
  resourceType: pageEvidenceResourceTypeSchema,
  key: z.string(),
  kind: pageEvidenceKindSchema,
  detail: z.string(),
  source: pageEvidenceSourceSchema,
  context: pageEvidenceContextSchema,
});
