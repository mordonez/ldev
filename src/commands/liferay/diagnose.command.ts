import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatGuestVisibilityReport,
  runGuestVisibilityDiagnosis,
} from '../../features/liferay/diagnose/liferay-guest-visibility.js';

type GuestVisibilityCommandOptions = {
  url?: string;
  site?: string;
  pageSize?: string;
};

export function createDiagnoseCommands(parent: Command): void {
  const diagnose = new Command('diagnose').description('Runtime diagnostics for common Liferay content bugs');
  diagnose.helpGroup('Portal diagnostics:');

  addOutputFormatOption(
    diagnose
      .command('guest-visibility')
      .description(
        'Compare authenticated vs anonymous access to detect content missing the default Guest View permission',
      )
      .option('--url <friendlyUrl>', 'Public page URL, like /web/guest/home')
      .option('--site <site>', 'Site friendly URL or numeric ID (scans structured contents and documents)')
      .option('--page-size <pageSize>', 'Headless page size for the content scan', '100'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: GuestVisibilityCommandOptions) =>
        runGuestVisibilityDiagnosis(context.config, {
          url: options.url,
          site: options.site,
          pageSize: Number.parseInt(options.pageSize ?? '100', 10) || 100,
        }),
      {
        text: formatGuestVisibilityReport,
        exitCode: (result) => (result.ok ? 0 : 1),
      },
    ),
  );

  parent.addCommand(diagnose);
}
