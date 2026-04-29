import type {AppConfig} from '../../../core/config/schema.js';
import {runDeployStatus} from '../../deploy/deploy-status.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_deploy_status';

export const inputSchema = {};

export const description =
  'Show the status of locally deployed Liferay modules (artifact name, state, last deploy time).';

export async function handleTool(_input: Record<string, unknown>, config: AppConfig) {
  return runJsonTool(() => runDeployStatus(config));
}
