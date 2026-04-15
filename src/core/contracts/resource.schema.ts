import {z} from 'zod';

/**
 * Schemas for resource surfaces (fragments, ADTs, structures, templates).
 * These define normalized sync/export/import output types.
 */

/**
 * LiferayResourceSyncFragmentItemResult: result of syncing a single fragment.
 * Status is 'imported' or 'error'; fragmentEntryId populated on success; error on failure.
 */
export const liferayResourceSyncFragmentItemResultSchema = z.object({
  collection: z.string(),
  fragment: z.string(),
  status: z.enum(['imported', 'error']),
  fragmentEntryId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceSyncFragmentItemResult = z.infer<typeof liferayResourceSyncFragmentItemResultSchema>;

/**
 * LiferayResourceSyncFragmentsSingleResult: aggregate result for a single-site fragment sync.
 * Includes mode (import strategy), site info, project directory, and detailed results.
 */
export const liferayResourceSyncFragmentsSingleResultSchema = z.object({
  mode: z.enum(['oauth-jsonws-import', 'oauth-zip-import']),
  site: z.string(),
  siteId: z.number().int(),
  projectDir: z.string(),
  summary: z.object({
    importedFragments: z.number().int().nonnegative(),
    fragmentResults: z.number().int().nonnegative(),
    pageTemplateResults: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }),
  fragmentResults: z.array(liferayResourceSyncFragmentItemResultSchema),
  pageTemplateResults: z.array(z.unknown()),
});

export type LiferayResourceSyncFragmentsSingleResult = z.infer<typeof liferayResourceSyncFragmentsSingleResultSchema>;

/**
 * LiferayResourceSyncFragmentsAllSitesResult: aggregate result for multi-site fragment sync.
 */
export const liferayResourceSyncFragmentsAllSitesResultSchema = z.object({
  mode: z.literal('all-sites'),
  sites: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  siteResults: z.array(liferayResourceSyncFragmentsSingleResultSchema),
});

export type LiferayResourceSyncFragmentsAllSitesResult = z.infer<
  typeof liferayResourceSyncFragmentsAllSitesResultSchema
>;

/**
 * LiferayResourceSyncFragmentsResult: discriminated union of single-site vs all-sites results.
 */
export const liferayResourceSyncFragmentsResultSchema = z.union([
  liferayResourceSyncFragmentsSingleResultSchema,
  liferayResourceSyncFragmentsAllSitesResultSchema,
]);

export type LiferayResourceSyncFragmentsResult = z.infer<typeof liferayResourceSyncFragmentsResultSchema>;

/**
 * LiferayResourceImportFailure: result of a failed import.
 */
export const liferayResourceImportFailureSchema = z.object({
  key: z.string(),
  error: z.string(),
});

export type LiferayResourceImportFailure = z.infer<typeof liferayResourceImportFailureSchema>;

/**
 * LiferayResourceSyncAdtItemResult: result of syncing a single ADT.
 */
export const liferayResourceSyncAdtItemResultSchema = z.object({
  widgetType: z.string(),
  key: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  templateId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceSyncAdtItemResult = z.infer<typeof liferayResourceSyncAdtItemResultSchema>;

/**
 * LiferayResourceSyncStructureItemResult: result of syncing a single structure.
 */
export const liferayResourceSyncStructureItemResultSchema = z.object({
  key: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  structureId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceSyncStructureItemResult = z.infer<typeof liferayResourceSyncStructureItemResultSchema>;

/**
 * LiferayResourceSyncTemplateItemResult: result of syncing a single template.
 */
export const liferayResourceSyncTemplateItemResultSchema = z.object({
  key: z.string(),
  structureKey: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  templateId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceSyncTemplateItemResult = z.infer<typeof liferayResourceSyncTemplateItemResultSchema>;
