import {z} from 'zod';

/**
 * Schemas for inventory surfaces (sites, templates, structures).
 * These define normalized output types that commands return.
 */

/**
 * LiferayInventorySite: normalized site info with group id, friendly URL, name, and pages command.
 */
export const liferayInventorySiteSchema = z.object({
  groupId: z.number().int().positive(),
  siteFriendlyUrl: z.string(),
  name: z.string(),
  pagesCommand: z.string(),
});

export type LiferayInventorySite = z.infer<typeof liferayInventorySiteSchema>;

/**
 * LiferayInventoryTemplate: normalized template info with id, name, structure ref, and optional script.
 */
export const liferayInventoryTemplateSchema = z.object({
  id: z.string(),
  name: z.string(),
  contentStructureId: z.number().int(),
  externalReferenceCode: z.string(),
  templateScript: z.string().optional(),
});

export type LiferayInventoryTemplate = z.infer<typeof liferayInventoryTemplateSchema>;

/**
 * LiferayInventoryStructure: minimal structure info with id, key, and name.
 */
export const liferayInventoryStructureSchema = z.object({
  id: z.number().int(),
  key: z.string(),
  name: z.string(),
});

export type LiferayInventoryStructure = z.infer<typeof liferayInventoryStructureSchema>;

/**
 * LiferayInventorySites: array of normalized sites.
 */
export const liferayInventorySitesSchema = z.array(liferayInventorySiteSchema);

export type LiferayInventorySites = z.infer<typeof liferayInventorySitesSchema>;

/**
 * LiferayInventoryTemplates: array of normalized templates.
 */
export const liferayInventoryTemplatesSchema = z.array(liferayInventoryTemplateSchema);

export type LiferayInventoryTemplates = z.infer<typeof liferayInventoryTemplatesSchema>;

/**
 * LiferayInventoryStructures: array of normalized structures.
 */
export const liferayInventoryStructuresSchema = z.array(liferayInventoryStructureSchema);

export type LiferayInventoryStructures = z.infer<typeof liferayInventoryStructuresSchema>;
