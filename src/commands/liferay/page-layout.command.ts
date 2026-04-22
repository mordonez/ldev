import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatLiferayPageLayoutDiff,
  runLiferayPageLayoutDiff,
} from '../../features/liferay/page-layout/liferay-page-layout-diff.js';
import {
  runLiferayPageLayoutExport,
  writeLiferayPageLayoutExport,
} from '../../features/liferay/page-layout/liferay-page-layout-export.js';

type PageLayoutDiffCommandOptions = {
  url: string;
  file?: string;
  referenceUrl?: string;
};

type PageLayoutExportCommandOptions = {
  url?: string;
  site?: string;
  friendlyUrl?: string;
  privateLayout?: boolean;
  output?: string;
  pretty?: boolean;
};

export function createPageLayoutCommands(parent: Command): void {
  const pageLayout = new Command('page-layout').description('Content page export and diff tools');
  pageLayout.helpGroup('Page workflows:');

  addOutputFormatOption(
    pageLayout
      .command('diff')
      .description('Compare a live content page against an export file or another live page')
      .requiredOption('--url <url>', 'Base live page URL')
      .option('--file <file>', 'Reference page-layout export JSON file')
      .option('--reference-url <referenceUrl>', 'Alternative live page URL to compare against'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: PageLayoutDiffCommandOptions) =>
        runLiferayPageLayoutDiff(context.config, {
          url: options.url,
          file: options.file,
          referenceUrl: options.referenceUrl,
        }),
      {
        text: formatLiferayPageLayoutDiff,
        exitCode: (result) => (result.equal ? 0 : 1),
      },
    ),
  );

  addOutputFormatOption(
    pageLayout
      .command('export')
      .description('Export a content page as normalized JSON')
      .option('--url <url>', 'Full page URL like /web/guest/home')
      .option('--site <site>', 'Site friendly URL or numeric ID')
      .option('--friendly-url <friendlyUrl>', 'Friendly URL inside the site, like /home')
      .option('--private-layout', 'Resolve the page as private when using --site + --friendly-url')
      .option('--output <file>', 'Write the export JSON to a file instead of stdout')
      .option('--pretty', 'Pretty-print the JSON file output', true),
    'json',
  ).action(
    createFormattedAction(
      async (context, options: PageLayoutExportCommandOptions) => {
        const pageExport = await runLiferayPageLayoutExport(context.config, {
          url: options.url,
          site: options.site,
          friendlyUrl: options.friendlyUrl,
          privateLayout: Boolean(options.privateLayout),
        });

        if (options.output) {
          const outputPath = await writeLiferayPageLayoutExport(pageExport, options.output, {
            pretty: Boolean(options.pretty),
          });

          return {outputPath};
        }

        return pageExport;
      },
      (_options) => ({
        text: (result) => ('outputPath' in result ? result.outputPath : JSON.stringify(result, null, 2)),
      }),
    ),
  );

  parent.addCommand(pageLayout);
}
