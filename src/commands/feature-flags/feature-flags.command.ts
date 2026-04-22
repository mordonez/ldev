import {Command} from 'commander';

import {
  addOutputFormatOption,
  createFormattedAction,
  createFormattedArgumentAction,
} from '../../cli/command-helpers.js';
import {
  formatFeatureFlagsList,
  formatFeatureFlagToggle,
  runFeatureFlagDisable,
  runFeatureFlagEnable,
  runFeatureFlagsList,
} from '../../features/feature-flags/feature-flags.js';

export function createFeatureFlagsCommand(): Command {
  const command = new Command('feature-flags')
    .description('List and toggle Liferay feature flags in portal-ext.properties')
    .addHelpText(
      'after',
      `
Examples:
  feature-flags list                   Show all known feature flags and their current state
  feature-flags enable LPD-63311       Enable the Liferay MCP server feature flag
  feature-flags disable LPD-63311      Disable the Liferay MCP server feature flag

Changes are written to portal-ext.properties. Restart the portal for them to take effect.
`,
    );

  addOutputFormatOption(command.command('list').description('List known feature flags and their current state')).action(
    createFormattedAction((context) => Promise.resolve(runFeatureFlagsList(context.config)), {
      text: formatFeatureFlagsList,
    }),
  );

  addOutputFormatOption(
    command.command('enable <id>').description('Enable a feature flag in portal-ext.properties'),
  ).action(
    createFormattedArgumentAction(async (context, id: string) => runFeatureFlagEnable(context.config, id), {
      text: formatFeatureFlagToggle,
    }),
  );

  addOutputFormatOption(
    command.command('disable <id>').description('Disable a feature flag in portal-ext.properties'),
  ).action(
    createFormattedArgumentAction(async (context, id: string) => runFeatureFlagDisable(context.config, id), {
      text: formatFeatureFlagToggle,
    }),
  );

  return command;
}
