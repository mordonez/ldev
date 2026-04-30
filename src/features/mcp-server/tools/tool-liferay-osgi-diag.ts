import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runOsgiDiag} from '../../osgi/osgi-diag.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_osgi_diag';

export const inputSchema = {
  bundle: z.string().describe('Bundle symbolic name or partial name to diagnose.'),
};

export const description = 'Run `ldev osgi diag <bundle>` and return the raw Gogo diag output plus resolved bundle id.';

export async function handleTool(input: {bundle: string}, config: AppConfig) {
  return runJsonTool(() => runOsgiDiag(config, {bundle: input.bundle}));
}
