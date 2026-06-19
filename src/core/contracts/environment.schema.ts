import {z} from 'zod';
import {doctorReportSchema} from './health.schema.js';

/**
 * Schemas for environment, status, and context CLI outputs.
 * Covers: ldev_status, ldev_logs_diagnose, ldev_context.
 */

// ── ldev_status: EnvStatusReport ──────────────────────────────────────────────

/**
 * EnvServiceStatusContract: state of a single Docker compose service.
 */
export const envServiceStatusSchema = z.object({
  service: z.string(),
  state: z.string().nullable(),
  health: z.string().nullable(),
  containerId: z.string().nullable(),
});

export type EnvServiceStatusContract = z.infer<typeof envServiceStatusSchema>;

/**
 * EnvStatusReportContract: full runtime status report returned by ldev_status.
 * Mirrors EnvStatusReport from core/runtime/env-health.ts.
 */
export const envStatusReportSchema = z.object({
  ok: z.boolean(),
  repoRoot: z.string(),
  dockerDir: z.string(),
  dockerEnvFile: z.string(),
  composeProjectName: z.string(),
  portalUrl: z.string(),
  portalReachable: z.boolean(),
  services: z.array(envServiceStatusSchema),
  liferay: envServiceStatusSchema.nullable(),
});

export type EnvStatusReportContract = z.infer<typeof envStatusReportSchema>;

// ── ldev_logs_diagnose: EnvLogsDiagnoseResult ─────────────────────────────────

/**
 * DiagnosedExceptionContract: a grouped exception entry from log analysis.
 */
export const diagnosedExceptionSchema = z.object({
  class: z.string(),
  count: z.number().int().nonnegative(),
  firstSeen: z.string().nullable(),
  lastSeen: z.string().nullable(),
  stackTrace: z.string(),
  suggestedCauses: z.array(z.string()),
});

export type DiagnosedExceptionContract = z.infer<typeof diagnosedExceptionSchema>;

/**
 * EnvLogsDiagnoseResultContract: output of ldev_logs_diagnose.
 * Mirrors EnvLogsDiagnoseResult from features/env/env-logs-diagnose.ts.
 */
export const envLogsDiagnoseResultSchema = z.object({
  ok: z.literal(true),
  service: z.string().nullable(),
  since: z.string().nullable(),
  warnings: z.number().int().nonnegative(),
  linesAnalyzed: z.number().int().nonnegative(),
  exceptions: z.array(diagnosedExceptionSchema),
});

export type EnvLogsDiagnoseResultContract = z.infer<typeof envLogsDiagnoseResultSchema>;

// ── ldev_context: AgentContextReport ─────────────────────────────────────────

/**
 * PresenceContract: presence/source of a configuration value.
 */
export const presenceSchema = z.object({
  status: z.enum(['present', 'missing']),
  source: z.enum(['env', 'localProfile', 'dockerEnv', 'profile', 'fallback']),
});

export type PresenceContract = z.infer<typeof presenceSchema>;

/**
 * CommandStatusContract: readiness of a CLI command.
 */
export const commandStatusSchema = z.object({
  supported: z.boolean(),
  requires: z.array(z.string()),
  missing: z.array(z.string()),
});

export type CommandStatusContract = z.infer<typeof commandStatusSchema>;

/**
 * AgentContextIssueContract: a diagnostic issue detected during context collection.
 */
export const agentContextIssueSchema = z.object({
  code: z.string(),
  severity: z.enum(['info', 'warning', 'error']),
  message: z.string(),
});

export type AgentContextIssueContract = z.infer<typeof agentContextIssueSchema>;

const inventoryListSchema = z.object({
  count: z.number().int().nonnegative(),
  sample: z.array(z.string()),
});

const inventoryCountSchema = z.object({
  path: z.string(),
  exists: z.boolean(),
  count: z.number().int().nonnegative(),
});

const platformOsSchema = z.enum(['linux', 'macos', 'windows']);

/**
 * AgentContextReportContract: full project/runtime snapshot returned by ldev_context.
 * Mirrors AgentContextReport from features/agent/agent-context-types.ts.
 */
export const agentContextReportSchema = z.object({
  ok: z.literal(true),
  generatedAt: z.string(),
  project: z.object({
    type: z.string(),
    cwd: z.string(),
    root: z.string().nullable(),
    branch: z.string().nullable(),
    isWorktree: z.boolean(),
    worktreeRoot: z.string().nullable(),
  }),
  liferay: z.object({
    product: z.string().nullable(),
    version: z.string().nullable(),
    edition: z.enum(['dxp', 'portal']).nullable(),
    image: z.string().nullable(),
    portalUrl: z.string().nullable(),
    auth: z.object({
      oauth2: z.object({
        clientId: presenceSchema,
        clientSecret: presenceSchema,
        scopes: z.number().int().nonnegative(),
      }),
    }),
    timeoutSeconds: z.number(),
  }),
  paths: z.object({
    dockerDir: z.string().nullable(),
    liferayDir: z.string().nullable(),
    dockerEnv: z.string().nullable(),
    liferayProfile: z.string().nullable(),
    liferayLocalProfile: z.string().nullable(),
    resources: z.object({
      structures: inventoryCountSchema,
      templates: inventoryCountSchema,
      adts: inventoryCountSchema,
      fragments: inventoryCountSchema,
      migrations: inventoryCountSchema,
    }),
  }),
  runtime: z.object({
    adapter: z.string(),
    composeFiles: z.array(z.string()),
    services: z.array(z.string()),
    ports: z.object({
      http: z.string().nullable(),
      debug: z.string().nullable(),
      gogo: z.string().nullable(),
      postgres: z.string().nullable(),
      elasticsearch: z.string().nullable(),
    }),
    composeProjectName: z.string().nullable(),
    dataRoot: z.string().nullable(),
  }),
  inventory: z.object({
    modules: inventoryListSchema,
    themes: inventoryListSchema,
    clientExtensions: inventoryListSchema,
    wars: inventoryListSchema,
    deployArtifacts: inventoryListSchema,
  }),
  ai: z.object({
    manifestPresent: z.boolean(),
  }),
  platform: z.object({
    os: platformOsSchema,
    tools: z.object({
      git: z.boolean(),
      docker: z.boolean(),
      dockerCompose: z.boolean(),
      java: z.boolean(),
      node: z.boolean(),
      blade: z.boolean(),
      lcp: z.boolean(),
      playwrightCli: z.boolean(),
    }),
    features: z.object({
      worktrees: z.boolean(),
      btrfsSnapshots: z.boolean(),
    }),
  }),
  commands: z.record(z.string(), commandStatusSchema),
  issues: z.array(agentContextIssueSchema),
});

export type AgentContextReportContract = z.infer<typeof agentContextReportSchema>;

const aiBootstrapIntentSchema = z.enum([
  'discover',
  'develop',
  'deploy',
  'troubleshoot',
  'migrate-resources',
  'osgi-debug',
]);

/**
 * AiBootstrapResultContract: intent-oriented aggregate returned by ldev_ai_bootstrap.
 */
export const aiBootstrapResultSchema = z.object({
  ok: z.literal(true),
  intent: aiBootstrapIntentSchema,
  cache: z
    .object({
      requestedTtlSeconds: z.number().int().positive(),
      hit: z.boolean(),
      ageSeconds: z.number().int().nonnegative().nullable(),
    })
    .nullable(),
  context: agentContextReportSchema,
  doctor: doctorReportSchema.nullable(),
  status: z.null(),
  recommendedNext: z.string(),
});

export type AiBootstrapResultContract = z.infer<typeof aiBootstrapResultSchema>;
