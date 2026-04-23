import type {AppConfig} from '../../core/config/load-config.js';
import {collectDoctorContext} from './doctor-collectors.js';
import {buildDoctorChecks} from './doctor-checks.js';
import {collectDoctorProbeSections} from './doctor-probes.js';
import {assembleDoctorReport, formatDoctor} from './doctor-format.js';
import type {DoctorCheckScope, DoctorDependencies, DoctorReport} from './doctor-types.js';

export type {DoctorCheck, DoctorReport, DoctorToolStatus} from './doctor-types.js';
export {formatDoctor};

export async function runDoctor(
  cwd: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    config?: AppConfig;
    dependencies?: DoctorDependencies;
    scopes?: DoctorCheckScope[];
  },
): Promise<DoctorReport> {
  const startedAt = Date.now();
  const scopes = options?.scopes ?? ['basic'];
  const ctx = await collectDoctorContext(cwd, options);
  const checks = buildDoctorChecks(ctx);
  const sections = await collectDoctorProbeSections(ctx, scopes, options);
  return assembleDoctorReport(ctx, [...checks, ...sections.checks], Date.now() - startedAt, scopes, sections);
}
