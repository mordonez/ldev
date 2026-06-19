import {z} from 'zod';

/**
 * Schemas for OSGi CLI outputs.
 * Covers: liferay_osgi_status, liferay_osgi_diag, liferay_osgi_thread_dump.
 */

// ── liferay_osgi_status: OsgiStatusResult ────────────────────────────────────

/**
 * OsgiStatusResultContract: Gogo shell lb output filtered by bundle name.
 * Mirrors OsgiStatusResult from features/osgi/osgi-status.ts.
 */
export const osgiStatusResultSchema = z.object({
  ok: z.literal(true),
  bundle: z.string(),
  output: z.string(),
});

export type OsgiStatusResultContract = z.infer<typeof osgiStatusResultSchema>;

// ── liferay_osgi_diag: OsgiDiagResult ────────────────────────────────────────

/**
 * OsgiDiagResultContract: Gogo diag output for a resolved bundle.
 * Mirrors OsgiDiagResult from features/osgi/osgi-diag.ts.
 */
export const osgiDiagResultSchema = z.object({
  ok: z.literal(true),
  bundle: z.string(),
  bundleId: z.string(),
  output: z.string(),
});

export type OsgiDiagResultContract = z.infer<typeof osgiDiagResultSchema>;

// ── liferay_osgi_thread_dump: OsgiThreadDumpResult ───────────────────────────

/**
 * OsgiThreadDumpResultContract: result of collecting thread dumps from Liferay.
 * Mirrors OsgiThreadDumpResult from features/osgi/osgi-thread-dump.ts.
 */
export const osgiThreadDumpResultSchema = z.object({
  ok: z.literal(true),
  count: z.number().int().positive(),
  intervalSeconds: z.number().int().positive(),
  outputDir: z.string(),
});

export type OsgiThreadDumpResultContract = z.infer<typeof osgiThreadDumpResultSchema>;
