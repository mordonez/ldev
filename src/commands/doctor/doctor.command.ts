import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatDoctor, runDoctor} from '../../features/doctor/doctor.service.js';
import type {DoctorCheckScope} from '../../features/doctor/doctor-types.js';

type DoctorCommandOptions = {
  listChecks?: boolean;
  readiness?: string;
  scope?: string;
  deep?: boolean;
  runtime?: boolean;
  portal?: boolean;
  osgi?: boolean;
  repoRoot?: string;
};

export function createDoctorCommand(): Command {
  return addOutputFormatOption(
    new Command('doctor')
      .description('Diagnose environment health and command readiness')
      .option('--scope <scope>', 'Check scope: basic, deep, runtime, portal, osgi')
      .option('--deep', 'Include deeper local checks')
      .option('--runtime', 'Include runtime-oriented checks')
      .option('--portal', 'Include portal-oriented checks')
      .option('--osgi', 'Include OSGi-oriented checks')
      .option('--list-checks', 'Print available check ids and scopes')
      .option('--readiness <command>', 'Exit non-zero unless the selected command readiness is ready')
      .addHelpText(
        'after',
        `
Use this when you need to know whether the environment is ready.
For offline project description, use ldev context.

Examples:
  ldev doctor --json
  ldev doctor --list-checks --json
  ldev doctor --readiness deploy
`,
      ),
  ).action(
    createFormattedAction(
      async (context, options: DoctorCommandOptions) => {
        const report = await runDoctor(context.cwd, {
          config: context.config,
          env: process.env,
          scopes: resolveDoctorScopes(options),
        });
        if (options.listChecks) {
          return {
            ok: true,
            contractVersion: 2,
            checks: report.checks.map((check) => ({
              id: check.id,
              scope: check.scope,
              summary: check.summary,
              remedy: check.remedy,
            })),
          };
        }
        return report;
      },
      (options: DoctorCommandOptions) => ({
        text: (result) => ('readiness' in result ? formatDoctor(result) : JSON.stringify(result, null, 2)),
        exitCode: (result) =>
          options.readiness && 'readiness' in result && result.readiness[options.readiness] !== 'ready' ? 1 : undefined,
      }),
    ),
  );
}

function resolveDoctorScopes(options: DoctorCommandOptions): DoctorCheckScope[] {
  const scopes = new Set<DoctorCheckScope>(['basic']);
  const requestedScopes = options.scope
    ?.split(',')
    .map((scope) => scope.trim())
    .filter(Boolean);

  for (const scope of requestedScopes ?? []) {
    if (isDoctorScope(scope)) {
      scopes.add(scope);
    }
  }
  if (options.deep) scopes.add('deep');
  if (options.runtime) scopes.add('runtime');
  if (options.portal) scopes.add('portal');
  if (options.osgi) scopes.add('osgi');

  return [...scopes];
}

function isDoctorScope(value: string): value is DoctorCheckScope {
  return ['basic', 'deep', 'runtime', 'portal', 'osgi'].includes(value);
}
