import {z} from 'zod';

/**
 * Schemas for health/check/doctor MCP tool outputs.
 * Covers: liferay_check, liferay_doctor, liferay_mcp_check.
 */

// ── liferay_check: LiferayHealthResult ────────────────────────────────────────

/**
 * LiferayHealthResultContract: OAuth reachability check result returned by liferay_check.
 * Mirrors LiferayHealthResult from features/liferay/liferay-health.ts.
 */
export const liferayHealthResultSchema = z.object({
  ok: z.literal(true),
  baseUrl: z.string(),
  clientId: z.string(),
  tokenType: z.string(),
  expiresIn: z.number(),
  checkedPath: z.string(),
  status: z.number().int(),
  permissionDenied: z.boolean(),
  probeUnavailable: z.boolean(),
});

export type LiferayHealthResultContract = z.infer<typeof liferayHealthResultSchema>;

// ── liferay_doctor: DoctorReport ─────────────────────────────────────────────

const doctorCheckStatusSchema = z.enum(['pass', 'warn', 'fail', 'skip']);

/**
 * DoctorCheckContract: a single diagnostic check result.
 */
export const doctorCheckSchema = z.object({
  id: z.string(),
  status: doctorCheckStatusSchema,
  scope: z.enum(['basic', 'deep', 'runtime', 'portal', 'osgi']).optional(),
  summary: z.string(),
  remedy: z.string().optional(),
  label: z.string().optional(),
  details: z.array(z.string()).optional(),
});

export type DoctorCheckContract = z.infer<typeof doctorCheckSchema>;

/**
 * DoctorToolStatusContract: availability and version of a platform tool.
 */
export const doctorToolStatusSchema = z.object({
  status: z.enum(['pass', 'warn', 'fail']),
  available: z.boolean(),
  version: z.string().nullable(),
  reason: z.string().optional(),
});

export type DoctorToolStatusContract = z.infer<typeof doctorToolStatusSchema>;

const doctorRuntimeServiceSchema = z.object({
  service: z.string(),
  state: z.string().nullable(),
  health: z.string().nullable(),
  exitCode: z.number().int().nullable(),
});

const doctorRuntimeReportSchema = z.object({
  status: doctorCheckStatusSchema,
  summary: z.string(),
  reason: z.string().optional(),
  services: z.array(doctorRuntimeServiceSchema),
});

const doctorPortalHttpReportSchema = z.object({
  status: doctorCheckStatusSchema,
  summary: z.string(),
  checkedPath: z.string(),
  httpStatus: z.number().int().nullable(),
  reachable: z.boolean(),
});

const doctorPortalOauthReportSchema = z.object({
  status: doctorCheckStatusSchema,
  summary: z.string(),
  configured: z.boolean(),
  tokenType: z.string().nullable(),
  expiresIn: z.number().nullable(),
  reason: z.string().optional(),
});

const doctorPortalReportSchema = z.object({
  status: doctorCheckStatusSchema,
  summary: z.string(),
  http: doctorPortalHttpReportSchema,
  oauth: doctorPortalOauthReportSchema.nullable(),
});

const doctorOsgiBundleSummarySchema = z.object({
  id: z.string(),
  state: z.string(),
  name: z.string(),
});

const doctorOsgiReportSchema = z.object({
  status: doctorCheckStatusSchema,
  summary: z.string(),
  reason: z.string().optional(),
  bundleCounts: z.object({
    total: z.number().int().nonnegative(),
    active: z.number().int().nonnegative(),
    resolved: z.number().int().nonnegative(),
    installed: z.number().int().nonnegative(),
    fragments: z.number().int().nonnegative(),
    other: z.number().int().nonnegative(),
  }),
  problematicBundles: z.array(doctorOsgiBundleSummarySchema),
});

const doctorToolsSchema = z.object({
  git: doctorToolStatusSchema,
  blade: doctorToolStatusSchema,
  docker: doctorToolStatusSchema,
  dockerDaemon: doctorToolStatusSchema,
  dockerCompose: doctorToolStatusSchema,
  node: doctorToolStatusSchema,
  java: doctorToolStatusSchema,
  lcp: doctorToolStatusSchema,
  playwrightCli: doctorToolStatusSchema,
});

/**
 * DoctorReportContract: full diagnostic report returned by liferay_doctor.
 * Mirrors DoctorReport from features/doctor/doctor-types.ts.
 */
export const doctorReportSchema = z.object({
  ok: z.boolean(),
  generatedAt: z.string(),
  ranChecks: z.array(z.enum(['basic', 'deep', 'runtime', 'portal', 'osgi'])),
  summary: z.object({
    passed: z.number().int().nonnegative(),
    warned: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    durationMs: z.number().nonnegative(),
  }),
  stamp: z.object({
    projectType: z.string(),
    portalUrl: z.string().nullable(),
  }),
  tools: doctorToolsSchema,
  checks: z.array(doctorCheckSchema),
  readiness: z.record(z.string(), z.enum(['ready', 'blocked', 'unknown'])),
  runtime: doctorRuntimeReportSchema.nullable(),
  portal: doctorPortalReportSchema.nullable(),
  osgi: doctorOsgiReportSchema.nullable(),
});

export type DoctorReportContract = z.infer<typeof doctorReportSchema>;

// ── liferay_mcp_check: McpCheckResult ─────────────────────────────────────────

/**
 * McpCheckResultContract: MCP endpoint reachability result returned by liferay_mcp_check.
 * Mirrors McpCheckResult from features/mcp/mcp.ts.
 */
export const mcpCheckResultSchema = z.object({
  ok: z.literal(true),
  baseUrl: z.string(),
  configuredFeatureFlag: z.boolean().nullable(),
  endpoints: z.array(
    z.object({
      url: z.string(),
      status: z.number().int().nullable(),
      reachable: z.boolean(),
    }),
  ),
  selectedEndpoint: z.string().nullable(),
  authorizationConfigured: z.boolean(),
});

export type McpCheckResultContract = z.infer<typeof mcpCheckResultSchema>;

const liferayPreflightSurfaceStatusSchema = z.enum(['ok', 'forbidden', 'unavailable', 'unknown']);

/**
 * LiferayPreflightResultContract: API surface availability returned by liferay_inventory_preflight.
 */
export const liferayPreflightResultSchema = z.object({
  adminSite: liferayPreflightSurfaceStatusSchema,
  adminUser: liferayPreflightSurfaceStatusSchema,
  jsonws: liferayPreflightSurfaceStatusSchema,
  expectedFallback: z.enum(['headless', 'admin-user', 'jsonws', 'none']),
});

export type LiferayPreflightResultContract = z.infer<typeof liferayPreflightResultSchema>;
