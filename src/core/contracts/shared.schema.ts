import {z} from 'zod';

/**
 * Shared schemas used across inventory and resource surfaces.
 * These define minimal, tolerant contracts for Liferay API payloads.
 */

/**
 * ResolvedSite: normalized site lookup result.
 * Represents a successfully resolved site with id, friendly path, and name.
 */
export const resolvedSiteSchema = z.object({
  id: z.number().int().positive(),
  friendlyUrlPath: z.string(),
  name: z.string(),
});

export type ResolvedSite = z.infer<typeof resolvedSiteSchema>;

/**
 * SiteLookupPayload: raw response from site lookup endpoints.
 * Tolerant: all fields optional to handle partial API responses.
 */
export const siteLookupPayloadSchema = z.object({
  id: z.number().int().optional(),
  friendlyUrlPath: z.string().optional(),
  name: z.string().or(z.record(z.string(), z.string())).optional(),
});

export type SiteLookupPayload = z.infer<typeof siteLookupPayloadSchema>;

/**
 * HeadlessPage<T>: paginated response wrapper from Liferay Headless APIs.
 * Generic over item type T.
 */
export const headlessPageSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema).optional(),
    lastPage: z.number().int().optional(),
  });

export type HeadlessPage<T> = {
  items?: T[];
  lastPage?: number;
};

/**
 * HeadlessSite: tolerant schema for headless-admin-site response.
 * Fields may be partial or use alternate names (nameCurrentValue, friendlyUrlPath vs id).
 */
export const headlessSiteSchema = z.object({
  id: z.number().int().optional(),
  friendlyUrlPath: z.string().optional(),
  nameCurrentValue: z.string().optional(),
  name: z.string().or(z.record(z.string(), z.string())).optional(),
});

export type HeadlessSite = z.infer<typeof headlessSiteSchema>;

/**
 * DataDefinition: schema for data-engine content structure response.
 * Tolerant to optional fields and localized names.
 */
export const dataDefinitionSchema = z.object({
  id: z.number().int().optional(),
  dataDefinitionKey: z.string().optional(),
  name: z.string().or(z.record(z.string(), z.string())).optional(),
});

export type DataDefinition = z.infer<typeof dataDefinitionSchema>;

/**
 * ContentTemplate: schema for headless-delivery template response.
 * Tolerant to id as string or number, and optional script field.
 */
export const contentTemplateSchema = z.object({
  id: z.string().or(z.number()).optional(),
  name: z.string().optional(),
  contentStructureId: z.number().int().optional(),
  externalReferenceCode: z.string().optional(),
  templateScript: z.string().optional(),
});

export type ContentTemplate = z.infer<typeof contentTemplateSchema>;

/**
 * JsonwsCompany: minimal schema for JSONWS company response.
 */
export const jsonwsCompanySchema = z.object({
  companyId: z.number().int().optional(),
});

export type JsonwsCompany = z.infer<typeof jsonwsCompanySchema>;

/**
 * JsonwsGroupSearchResult: tolerant schema for JSONWS group search response.
 * Supports both 'friendlyURL' (legacy) and 'friendlyUrl' field names.
 */
export const jsonwsGroupSearchResultSchema = z.object({
  groupId: z.number().int().optional(),
  friendlyURL: z.string().optional(),
  friendlyUrl: z.string().optional(),
  nameCurrentValue: z.string().optional(),
  name: z.string().optional(),
  site: z.boolean().optional(),
});

export type JsonwsGroupSearchResult = z.infer<typeof jsonwsGroupSearchResultSchema>;
