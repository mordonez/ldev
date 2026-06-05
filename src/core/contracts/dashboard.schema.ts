import {z} from 'zod';

import {envServiceStatusSchema} from './environment.schema.js';

/**
 * Schemas for dashboard HTTP API JSON responses.
 * Covers the shapes returned by src/entrypoints/dashboard/ route handlers
 * to the Preact client.
 */

// ── Task system ───────────────────────────────────────────────────────────────

/**
 * DashboardTaskLevelContract: severity level of a task log entry.
 */
export const dashboardTaskLevelSchema = z.enum(['info', 'error']);
export type DashboardTaskLevelContract = z.infer<typeof dashboardTaskLevelSchema>;

/**
 * DashboardTaskStatusContract: lifecycle state of a running or completed task.
 */
export const dashboardTaskStatusSchema = z.enum(['running', 'canceling', 'succeeded', 'failed', 'canceled']);
export type DashboardTaskStatusContract = z.infer<typeof dashboardTaskStatusSchema>;

/**
 * DashboardTaskLogEntryContract: a single log line emitted by a task.
 */
export const dashboardTaskLogEntrySchema = z.object({
  id: z.string().uuid(),
  level: dashboardTaskLevelSchema,
  message: z.string(),
  timestamp: z.string().datetime(),
});
export type DashboardTaskLogEntryContract = z.infer<typeof dashboardTaskLogEntrySchema>;

/**
 * DashboardTaskContract: serialised task record returned in task list and
 * accepted/cancelled responses.
 */
export const dashboardTaskSchema = z.object({
  id: z.string().uuid(),
  kind: z.string(),
  label: z.string(),
  worktreeName: z.string().nullable(),
  status: dashboardTaskStatusSchema,
  startedAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  logs: z.array(dashboardTaskLogEntrySchema),
});
export type DashboardTaskContract = z.infer<typeof dashboardTaskSchema>;

/**
 * DashboardTaskListResponseContract: response body for GET /api/tasks.
 * Also used as the SSE event payload for GET /api/tasks/stream.
 */
export const dashboardTaskListResponseSchema = z.object({
  tasks: z.array(dashboardTaskSchema),
});
export type DashboardTaskListResponseContract = z.infer<typeof dashboardTaskListResponseSchema>;

/**
 * DashboardTaskAcceptedResponseContract: 202 response body for any queued
 * task action (worktree create, db sync, resource export, mcp doctor, etc.).
 */
export const dashboardTaskAcceptedResponseSchema = z.object({
  ok: z.literal(true),
  task: dashboardTaskSchema,
  taskId: z.string().uuid(),
  duplicate: z.boolean(),
});
export type DashboardTaskAcceptedResponseContract = z.infer<typeof dashboardTaskAcceptedResponseSchema>;

/**
 * DashboardTaskBlockedResponseContract: 409 response body when a task cannot
 * be queued because another task is already running for the same worktree.
 */
export const dashboardTaskBlockedResponseSchema = z.object({
  error: z.string(),
  task: dashboardTaskSchema,
  taskId: z.string().uuid(),
});
export type DashboardTaskBlockedResponseContract = z.infer<typeof dashboardTaskBlockedResponseSchema>;

/**
 * DashboardTaskCancelResponseContract: 202 response body for
 * POST /api/tasks/:id/cancel.
 */
export const dashboardTaskCancelResponseSchema = z.object({
  ok: z.literal(true),
  task: dashboardTaskSchema,
  taskId: z.string().uuid(),
});
export type DashboardTaskCancelResponseContract = z.infer<typeof dashboardTaskCancelResponseSchema>;

// ── Worktree snapshot ─────────────────────────────────────────────────────────

/**
 * DashboardGitCommitContract: a short git commit record included in a
 * worktree snapshot.
 */
export const dashboardGitCommitSchema = z.object({
  hash: z.string(),
  subject: z.string(),
  date: z.string(),
});
export type DashboardGitCommitContract = z.infer<typeof dashboardGitCommitSchema>;

/**
 * DashboardAheadBehindContract: ahead/behind comparison between a worktree
 * branch and its base branch.
 */
export const dashboardAheadBehindSchema = z.object({
  ahead: z.number().int().nonnegative(),
  behind: z.number().int().nonnegative(),
  base: z.string(),
});
export type DashboardAheadBehindContract = z.infer<typeof dashboardAheadBehindSchema>;

/**
 * DashboardEnvContract: Docker compose environment state for a worktree.
 * Mirrors DashboardEnv from entrypoints/dashboard/dashboard-worktree-snapshot.ts.
 */
export const dashboardEnvSchema = z.object({
  dockerDir: z.string(),
  error: z.string().nullable(),
  portalUrl: z.string(),
  glowrootUrl: z.string().optional(),
  portalReachable: z.boolean().nullable(),
  services: z.array(envServiceStatusSchema),
  liferay: envServiceStatusSchema.nullable(),
  status: z.enum(['ok', 'error']),
});
export type DashboardEnvContract = z.infer<typeof dashboardEnvSchema>;

/**
 * DashboardWorktreeContract: a single worktree entry as returned in the
 * worktrees array of GET /api/status.
 */
export const dashboardWorktreeSchema = z.object({
  name: z.string(),
  path: z.string(),
  branch: z.string().nullable(),
  isMain: z.boolean(),
  detached: z.boolean(),
  env: dashboardEnvSchema.nullable(),
  commits: z.array(dashboardGitCommitSchema),
  changedFiles: z.number().int().nonnegative(),
  changedPaths: z.array(z.string()),
  aheadBehind: dashboardAheadBehindSchema.nullable(),
});
export type DashboardWorktreeContract = z.infer<typeof dashboardWorktreeSchema>;

// ── Status response ───────────────────────────────────────────────────────────

/**
 * DashboardMcpClientStatusContract: configuration state of a single MCP
 * client tool (claude-code, cursor, vscode).
 */
export const dashboardMcpClientStatusSchema = z.object({
  tool: z.enum(['claude-code', 'cursor', 'vscode']),
  configPath: z.string(),
  configExists: z.boolean(),
});
export type DashboardMcpClientStatusContract = z.infer<typeof dashboardMcpClientStatusSchema>;

/**
 * DashboardMcpStatusContract: aggregate MCP client configuration status.
 */
export const dashboardMcpStatusSchema = z.object({
  targetDir: z.string(),
  clients: z.array(dashboardMcpClientStatusSchema),
});
export type DashboardMcpStatusContract = z.infer<typeof dashboardMcpStatusSchema>;

/**
 * DashboardStatusResponseContract: full response body for GET /api/status.
 * Mirrors DashboardStatus from entrypoints/dashboard/dashboard-data.ts.
 */
export const dashboardStatusResponseSchema = z.object({
  cwd: z.string(),
  refreshedAt: z.string().datetime(),
  mcp: dashboardMcpStatusSchema,
  worktrees: z.array(dashboardWorktreeSchema),
});
export type DashboardStatusResponseContract = z.infer<typeof dashboardStatusResponseSchema>;

// ── Log responses ─────────────────────────────────────────────────────────────

/**
 * DashboardLogsResponseContract: response body for GET /api/worktrees/:name/logs.
 */
export const dashboardLogsResponseSchema = z.object({
  logs: z.string(),
  containerId: z.string().nullable(),
  service: z.literal('liferay'),
  running: z.boolean(),
});
export type DashboardLogsResponseContract = z.infer<typeof dashboardLogsResponseSchema>;

/**
 * DashboardLogStreamEventContract: individual NDJSON event written to the
 * streaming response for GET /api/worktrees/:name/logs/stream.
 * The `type` field discriminates each event.
 */
export const dashboardLogStreamEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('meta'),
    containerId: z.string().nullable(),
    running: z.boolean(),
    service: z.literal('liferay'),
  }),
  z.object({
    type: z.literal('chunk'),
    stream: z.enum(['stdout', 'stderr']),
    chunk: z.string(),
  }),
  z.object({type: z.literal('keepalive')}),
  z.object({
    type: z.literal('error'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('end'),
    exitCode: z.number().int(),
    signal: z.string().nullable().optional(),
  }),
]);
export type DashboardLogStreamEventContract = z.infer<typeof dashboardLogStreamEventSchema>;

// ── Maintenance (worktree GC) ─────────────────────────────────────────────────

/**
 * DashboardMaintenancePreviewResponseContract: response body for
 * GET /api/maintenance/worktrees/gc.
 * Mirrors WorktreeGcResult + the unavailable fallback shape.
 */
export const dashboardMaintenancePreviewResponseSchema = z.object({
  ok: z.literal(true),
  apply: z.literal(false),
  candidates: z.array(z.string()),
  protected: z.array(z.string()),
  cleaned: z.array(z.string()),
  unavailable: z.boolean().optional(),
  message: z.string().optional(),
});
export type DashboardMaintenancePreviewResponseContract = z.infer<typeof dashboardMaintenancePreviewResponseSchema>;
