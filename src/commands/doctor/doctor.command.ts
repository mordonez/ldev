import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatDoctor, runDoctor} from '../../features/doctor/doctor.service.js';

export function createDoctorCommand(): Command {
  return addOutputFormatOption(
    new Command('doctor').description('Validate host prerequisites, repo context and effective CLI config'),
  ).action(
    createFormattedAction(async (context) => runDoctor(context.cwd, {config: context.config, env: process.env}), {
      text: formatDoctor,
    }),
  );
}
