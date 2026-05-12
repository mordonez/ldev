import {z} from 'zod';

import {pageEvidenceSourceSchema} from '../../../core/contracts/inventory.schema.js';

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

export const pageEvidenceSchema = z.object({
  resourceType: pageEvidenceResourceTypeSchema,
  key: z.string(),
  kind: pageEvidenceKindSchema,
  detail: z.string(),
  source: pageEvidenceSourceSchema,
  context: pageEvidenceContextSchema,
});
