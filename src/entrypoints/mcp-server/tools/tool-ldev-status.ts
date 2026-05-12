import type {AppConfig} from '../../../core/config/schema.js';
import {createRuntimeAdapter} from '../../../core/runtime/runtime-adapter-factory.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'ldev_status';

export const inputSchema = {};

export const description =
  'Return the same local runtime status as `ldev status --json`: container state, health and portal reachability.';

export async function handleTool(_input: Record<string, unknown>, config: AppConfig) {
  return runJsonTool(() => createRuntimeAdapter(config).status());
}
