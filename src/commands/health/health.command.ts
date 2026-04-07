import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatHealth, runHealth} from '../../features/health/health.js';

export function createHealthCommand(): Command {
  return addOutputFormatOption(
    new Command('health').description('Unified runtime health snapshot for automation and continuous checks'),
    'json',
  ).action(createFormattedAction(async (context) => runHealth(context.config), {text: formatHealth}));
}
