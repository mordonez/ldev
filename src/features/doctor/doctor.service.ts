import type {AppConfig} from '../../core/config/load-config.js';
import {collectDoctorContext} from './doctor-collectors.js';
import {buildDoctorChecks} from './doctor-checks.js';
import {assembleDoctorReport, formatDoctor} from './doctor-format.js';
import type {DoctorDependencies, DoctorReport} from './doctor-types.js';

export type {DoctorCheck, DoctorReport, DoctorToolStatus} from './doctor-types.js';
export {formatDoctor};

export async function runDoctor(
  cwd: string,
  options?: {
    env?: NodeJS.ProcessEnv;
    config?: AppConfig;
    dependencies?: DoctorDependencies;
  },
): Promise<DoctorReport> {
  const ctx = await collectDoctorContext(cwd, options);
  const checks = buildDoctorChecks(ctx);
  return assembleDoctorReport(ctx, checks);
}
