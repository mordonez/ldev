import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {parseBootstrapCacheTtl, runAiBootstrap} from '../../../features/agent/agent-bootstrap.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'ldev_ai_bootstrap';

export const inputSchema = {
  intent: z
    .enum(['discover', 'develop', 'deploy', 'troubleshoot', 'migrate-resources', 'osgi-debug'])
    .describe('Agent intent to bootstrap context for.'),
  cache: z.string().optional().describe('Optional positive TTL in seconds for bootstrap cache reuse.'),
};

export const description =
  'Aggregate project context and targeted diagnostics for an agent intent, matching `ldev ai bootstrap --json`.';

export async function handleTool(input: {intent: string; cache?: string}, config: AppConfig, cwd: string) {
  return runJsonTool(() =>
    runAiBootstrap(cwd, {
      intent: input.intent,
      config,
      env: process.env,
      cacheTtlSeconds: parseBootstrapCacheTtl(input.cache),
    }),
  );
}
