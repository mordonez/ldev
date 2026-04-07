import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayThemeCheck, runLiferayThemeCheck} from '../../features/liferay/liferay-theme-check.js';

export function createLiferayThemeCheckCommand(): Command {
  return addOutputFormatOption(
    new Command('theme-check')
      .description('Validate Clay icon coverage for a deployed theme')
      .option('--theme <theme>', 'Theme name', 'custom-theme'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayThemeCheck(context.config, {
          theme: options.theme,
        }),
      {text: formatLiferayThemeCheck},
    ),
  );
}
