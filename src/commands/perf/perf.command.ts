import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatPerfBaseline, formatPerfCheck, runPerfBaseline, runPerfCheck} from '../../features/perf/perf.js';

export function createPerfCommand(): Command {
  const command = new Command('perf').description(
    'Capture and compare lightweight local runtime performance baselines',
  );

  addOutputFormatOption(
    command
      .command('baseline')
      .description('Measure current local latencies and persist them as baseline')
      .option('--baseline <file>', 'Custom baseline file'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {baseline?: string}) => runPerfBaseline(context.config, {baseline: options.baseline}),
      {text: formatPerfBaseline},
    ),
  );

  addOutputFormatOption(
    command
      .command('check')
      .description('Compare current local latencies against a saved baseline')
      .option('--baseline <file>', 'Custom baseline file'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: {baseline?: string}) => runPerfCheck(context.config, {baseline: options.baseline}),
      {text: formatPerfCheck},
    ),
  );

  return command;
}
