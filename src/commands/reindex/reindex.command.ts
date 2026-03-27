import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatReindexSpeedup, runReindexSpeedup} from '../../features/reindex/reindex-speedup.js';
import {formatReindexStatus, runReindexStatus} from '../../features/reindex/reindex-status.js';
import {formatReindexTasks, runReindexTasks} from '../../features/reindex/reindex-tasks.js';
import {formatReindexWatch, runReindexWatch} from '../../features/reindex/reindex-watch.js';

export function createReindexCommand(): Command {
  const command = new Command('reindex');
  command
    .description('Reindex observation and temporary Elasticsearch tuning')
    .addHelpText('after', `
Observational commands:
  status, watch, tasks

Temporary mutating commands:
  speedup-on, speedup-off   Change refresh_interval while a reindex is running
`);

  addOutputFormatOption(
    command
      .command('status')
      .description('Ver progreso del reindex en Elasticsearch'),
  ).action(createFormattedAction(async (context) => runReindexStatus(context.config), {text: formatReindexStatus}));

  addOutputFormatOption(
    command
      .command('watch')
      .description('Monitorizar reindex en tiempo real')
      .option('--interval <seconds>', 'Seconds between checks', '5')
      .option('--iterations <count>', 'Number of checks', '60'),
  ).action(createFormattedAction(async (context, options: {interval?: string; iterations?: string}) => runReindexWatch(context.config, {
        intervalSeconds: Number(options.interval ?? '5'),
        iterations: Number(options.iterations ?? '60'),
      }), {text: formatReindexWatch}));

  addOutputFormatOption(
    command
      .command('speedup-on')
      .description('Activar modo rapido de reindex (refresh_interval=-1)'),
  ).action(createFormattedAction(async (context) => runReindexSpeedup(context.config, {enabled: true}), {text: formatReindexSpeedup}));

  addOutputFormatOption(
    command
      .command('speedup-off')
      .description('Desactivar modo rapido de reindex (refresh_interval=1s)'),
  ).action(createFormattedAction(async (context) => runReindexSpeedup(context.config, {enabled: false}), {text: formatReindexSpeedup}));

  addOutputFormatOption(
    command
      .command('tasks')
      .description('Mostrar tareas de reindex activas en Liferay'),
  ).action(createFormattedAction(async (context) => runReindexTasks(context.config), {text: formatReindexTasks}));

  return command;
}
