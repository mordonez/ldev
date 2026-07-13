import type {Command} from 'commander';

import {addOutputFormatOption, createFormattedArgumentAction} from '../../cli/command-helpers.js';
import {
  formatLiferayResourcePlan,
  runLiferayResourcePlan,
} from '../../features/liferay/resource/liferay-resource-plan.js';
import {collectRepeatableOption} from './resource.command.js';

type ResourcePlanCommandOptions = {
  type?: string;
  site: string[];
  includePrivate?: boolean;
  skipUsage?: boolean;
  siteLimit?: string;
  maxDepth?: string;
  concurrency?: string;
  pageSize?: string;
};

export function registerResourcePlanCommand(resource: Command): void {
  addOutputFormatOption(
    resource
      .command('plan')
      .description('Compose owner, duplicates, where-used impact and a suggested import command for one resource')
      .argument('<resource>', 'Structure/template/ADT/fragment key, ERC or numeric id')
      .option('--type <type>', 'Resource type: structure | template | adt | fragment; inferred when omitted')
      .option(
        '--site <site>',
        'Limit discovery and where-used scan to one or more sites (repeatable; defaults to all accessible sites)',
        collectRepeatableOption,
        [] as string[],
      )
      .option('--include-private', 'Also scan private layouts during the where-used impact check')
      .option('--skip-usage', 'Skip the where-used impact scan and only report owner/duplicates/suggested command')
      .option('--site-limit <n>', 'Maximum number of sites to scan for where-used when --site is not provided')
      .option('--max-depth <maxDepth>', 'Maximum page tree recursion depth for the where-used scan', '12')
      .option('--concurrency <n>', 'Parallel page fetches per site for the where-used scan', '4')
      .option('--page-size <pageSize>', 'Headless page size used for discovery and where-used listings', '200')
      .addHelpText(
        'after',
        `
Examples:
  ldev resource plan BASIC
  ldev resource plan UB_TPL_DESTACATS_MULTIMEDIA --type template
  ldev resource plan card-hero --type fragment --site /guest
  ldev resource plan UB_ADT_STUDIES_SEARCH --skip-usage --json

Notes:
  - Owner is resolved via the runtime inventory (structures, templates, ADTs or fragments), not by grepping local files.
  - When the key exists in more than one site, all occurrences are reported as duplicates and the /global site
    (or the first found site) is reported as the owner; confirm the intended site before importing.
  - The suggested import command always uses --check-only for structure/template/adt (fragment import has no
    check-only preview, so an export baseline is recommended first instead).
`,
      ),
    'text',
  ).action(
    createFormattedArgumentAction(
      async (context, resourceArg: string, options: ResourcePlanCommandOptions) =>
        runLiferayResourcePlan(context.config, {
          resource: resourceArg,
          type: options.type,
          sites: options.site.length > 0 ? options.site : undefined,
          includePrivate: Boolean(options.includePrivate),
          skipUsage: Boolean(options.skipUsage),
          siteLimit: options.siteLimit !== undefined ? Number.parseInt(options.siteLimit, 10) : undefined,
          maxDepth: options.maxDepth !== undefined ? Number.parseInt(options.maxDepth, 10) : undefined,
          concurrency: options.concurrency !== undefined ? Number.parseInt(options.concurrency, 10) : undefined,
          pageSize: options.pageSize !== undefined ? Number.parseInt(options.pageSize, 10) : undefined,
        }),
      {text: formatLiferayResourcePlan},
    ),
  );
}
