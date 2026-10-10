import {z} from 'zod';

/**
 * Schemas for resource surfaces (fragments, ADTs, structures, templates).
 * These define normalized sync/export/import output types.
 */

/**
 * LiferayResourceImportFragmentItemResult: result of syncing a single fragment.
 * Status is 'imported' or 'error'; fragmentEntryId populated on success; error on failure.
 */
export const liferayResourceSyncFragmentItemResultSchema = z.object({
  collection: z.string(),
  fragment: z.string(),
  status: z.enum(['imported', 'error']),
  fragmentEntryId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceImportFragmentItemResult = z.infer<typeof liferayResourceSyncFragmentItemResultSchema>;

/**
 * LiferayResourceImportFragmentsSingleResult: aggregate result for a single-site fragment sync.
 * Includes mode (import strategy), site info, project directory, and detailed results.
 */
export const liferayResourceSyncFragmentsSingleResultSchema = z.object({
  mode: z.enum(['oauth-jsonws-import', 'auto-deploy-zip-import']),
  site: z.string(),
  siteId: z.number().int(),
  projectDir: z.string(),
  zipPath: z.string().optional(),
  summary: z.object({
    importedFragments: z.number().int().nonnegative(),
    fragmentResults: z.number().int().nonnegative(),
    pageTemplateResults: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }),
  fragmentResults: z.array(liferayResourceSyncFragmentItemResultSchema),
  pageTemplateResults: z.array(z.unknown()),
});

export type LiferayResourceImportFragmentsSingleResult = z.infer<typeof liferayResourceSyncFragmentsSingleResultSchema>;

/**
 * LiferayResourceImportFragmentsAllSitesResult: aggregate result for multi-site fragment sync.
 */
export const liferayResourceSyncFragmentsAllSitesResultSchema = z.object({
  mode: z.literal('all-sites'),
  sites: z.number().int().nonnegative(),
  imported: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  siteResults: z.array(liferayResourceSyncFragmentsSingleResultSchema),
});

export type LiferayResourceImportFragmentsAllSitesResult = z.infer<
  typeof liferayResourceSyncFragmentsAllSitesResultSchema
>;

/**
 * LiferayResourceImportFragmentsResult: discriminated union of single-site vs all-sites results.
 */
export const liferayResourceSyncFragmentsResultSchema = z.discriminatedUnion('mode', [
  liferayResourceSyncFragmentsSingleResultSchema,
  liferayResourceSyncFragmentsAllSitesResultSchema,
]);

export type LiferayResourceImportFragmentsResult = z.infer<typeof liferayResourceSyncFragmentsResultSchema>;

/**
 * ResourceLintSeverity: severity level of a static lint finding.
 */
export const resourceLintSeveritySchema = z.enum(['error', 'warning']);

export type ResourceLintSeverity = z.infer<typeof resourceLintSeveritySchema>;

/**
 * ResourceLintFinding: one static lint finding against a local resource file.
 * `location` is an optional pointer inside the file (JSON path or line number).
 */
export const resourceLintFindingSchema = z.object({
  file: z.string(),
  rule: z.string(),
  severity: resourceLintSeveritySchema,
  message: z.string(),
  location: z.string().optional(),
});

export type ResourceLintFinding = z.infer<typeof resourceLintFindingSchema>;

/**
 * ResourceLintResult: aggregate result of a static lint run.
 * `ok` is false when at least one error-severity finding exists.
 */
export const resourceLintResultSchema = z.object({
  target: z.string(),
  filesScanned: z.number().int().nonnegative(),
  findings: z.array(resourceLintFindingSchema),
  summary: z.object({
    errors: z.number().int().nonnegative(),
    warnings: z.number().int().nonnegative(),
  }),
  ok: z.boolean(),
});

export type ResourceLintResult = z.infer<typeof resourceLintResultSchema>;

/**
 * LiferayResourceImportFailure: result of a failed import.
 */
export const liferayResourceImportFailureSchema = z.object({
  key: z.string(),
  error: z.string(),
});

export type LiferayResourceImportFailure = z.infer<typeof liferayResourceImportFailureSchema>;

/**
 * LiferayResourceImportAdtItemResult: result of importing a single ADT.
 */
export const liferayResourceImportAdtItemResultSchema = z.object({
  widgetType: z.string(),
  key: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  templateId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceImportAdtItemResult = z.infer<typeof liferayResourceImportAdtItemResultSchema>;

/**
 * LiferayResourceImportStructureItemResult: result of importing a single structure.
 */
export const liferayResourceImportStructureItemResultSchema = z.object({
  key: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  structureId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceImportStructureItemResult = z.infer<typeof liferayResourceImportStructureItemResultSchema>;

/**
 * LiferayResourceImportTemplateItemResult: result of importing a single template.
 */
export const liferayResourceImportTemplateItemResultSchema = z.object({
  key: z.string(),
  structureKey: z.string(),
  status: z.enum(['created', 'updated', 'unchanged', 'error']),
  templateId: z.number().int().optional(),
  error: z.string().optional(),
});

export type LiferayResourceImportTemplateItemResult = z.infer<typeof liferayResourceImportTemplateItemResultSchema>;
