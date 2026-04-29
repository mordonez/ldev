import type {AppConfig} from '../../../core/config/schema.js';
import {runAgentContext} from '../../agent/agent-context.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'ldev_context';

export const inputSchema = {};

export const description =
  'Return the same structured project/runtime snapshot as `ldev context --json`: repo, portal URL, paths, inventory, platform tools, and command readiness.';

export async function handleTool(_input: Record<string, unknown>, config: AppConfig, cwd: string) {
  return runJsonTool(() => runAgentContext(cwd, {config}));
}
