import {z} from 'zod';
import type {AppConfig} from '../../../core/config/schema.js';
import {runDoctor} from '../../doctor/doctor.service.js';
import type {DoctorCheckScope} from '../../doctor/doctor-types.js';
import {runJsonTool} from './tool-result.js';

export const TOOL_NAME = 'liferay_doctor';

export const inputSchema = {
  scopes: z
    .array(z.enum(['basic', 'deep', 'runtime', 'portal', 'osgi']))
    .optional()
    .describe('Checks to run. Defaults to basic. Options: basic, deep, runtime, portal, osgi'),
};

export const description =
  'Run ldev diagnostics: checks environment, Docker runtime, portal reachability, and OSGi bundle health.';

export async function handleTool(input: {scopes?: DoctorCheckScope[]}, config: AppConfig, cwd: string) {
  return runJsonTool(() => runDoctor(cwd, {config, env: process.env, scopes: input.scopes}));
}
