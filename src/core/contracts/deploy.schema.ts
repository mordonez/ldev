import {z} from 'zod';

/**
 * Schemas for deploy MCP tool outputs.
 * Covers: liferay_deploy_status.
 */

// ── liferay_deploy_status: DeployStatusResult ────────────────────────────────

/**
 * DeployStatusModuleContract: a single deployed module entry.
 */
export const deployStatusModuleSchema = z.object({
  name: z.string(),
  artifact: z.string(),
  state: z.enum(['ACTIVE', 'DEPLOYED']),
  source: z.enum(['build', 'cache']),
  deployedAt: z.string().nullable(),
});

export type DeployStatusModuleContract = z.infer<typeof deployStatusModuleSchema>;

/**
 * DeployStatusResultContract: full deploy status returned by liferay_deploy_status.
 * Mirrors DeployStatusResult from features/deploy/deploy-status.ts.
 */
export const deployStatusResultSchema = z.object({
  ok: z.literal(true),
  buildDeployDir: z.string(),
  cacheDir: z.string(),
  lastDeployCommit: z.string().nullable(),
  lastDeployAt: z.string().nullable(),
  modules: z.array(deployStatusModuleSchema),
});

export type DeployStatusResultContract = z.infer<typeof deployStatusResultSchema>;
