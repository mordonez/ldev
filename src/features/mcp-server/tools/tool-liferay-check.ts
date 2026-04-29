import type {AppConfig} from '../../../core/config/schema.js';
import {runLiferayHealth} from '../../liferay/liferay-health.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_check';

export const inputSchema = {};

export const description =
  'Run the same OAuth and basic API reachability check as `ldev portal check --json`. Does not return access tokens.';

export async function handleTool(_input: Record<string, unknown>, config: AppConfig) {
  return runJsonTool(() => runLiferayHealth(config));
}
