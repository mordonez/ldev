import {Command} from 'commander';

import {CliError} from '../../core/errors.js';
import {createCommandContext} from '../../cli/command-context.js';
import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatContentStats,
  runContentStats,
  type ContentStatsResult,
} from '../../features/liferay/content/liferay-content-stats.js';
import {
  formatLiferayInventoryPage,
  projectLiferayInventoryPageJson,
  resolveInventoryPageRequest,
  runLiferayInventoryPage,
} from '../../features/liferay/inventory/liferay-inventory-page.js';
import {
  formatLiferayInventoryPages,
  runLiferayInventoryPages,
} from '../../features/liferay/inventory/liferay-inventory-pages.js';
import {
  formatLiferayInventorySites,
  type LiferayInventorySite,
  runLiferayInventorySites,
} from '../../features/liferay/inventory/liferay-inventory-sites.js';
import {
  formatLiferayInventoryStructures,
  type LiferayInventoryStructuresResult,
  runLiferayInventoryStructuresAllSites,
  runLiferayInventoryStructures,
} from '../../features/liferay/inventory/liferay-inventory-structures.js';
import {
  formatLiferayInventoryTemplates,
  runLiferayInventoryTemplates,
} from '../../features/liferay/inventory/liferay-inventory-templates.js';
import {
  formatLiferayInventoryWhereUsed,
  runLiferayInventoryWhereUsed,
  type WhereUsedResourceType,
} from '../../features/liferay/inventory/liferay-inventory-where-used.js';
import {formatLiferayPreflight, runLiferayPreflight} from '../../features/liferay/liferay-preflight.js';

function collect(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function formatInventorySitesResult(result: LiferayInventorySite[] | ContentStatsResult): string {
  return Array.isArray(result) ? formatLiferayInventorySites(result) : formatContentStats(result);
}

type InventoryPagesCommandOptions = {
  site: string;
  privateLayout?: boolean;
  maxDepth: string;
};

type InventoryPageCommandOptions = {
  url?: string;
  site?: string;
  friendlyUrl?: string;
  privateLayout?: boolean;
  verbose?: boolean;
  full?: boolean;
  format?: string;
  json?: boolean;
  ndjson?: boolean;
};

type InventoryStructuresCommandOptions = {
  site: string;
  pageSize: string;
  withTemplates?: boolean;
  allSites?: boolean;
};

type InventoryTemplatesCommandOptions = {
  site: string;
  pageSize: string;
};

type InventoryPreflightCommandOptions = {
  forceRefresh?: boolean;
};

type InventoryWhereUsedCommandOptions = {
  type: string;
  key: string[];
  site?: string;
  widgetType?: string;
  className?: string;
  includePrivate?: boolean;
  maxDepth: string;
  concurrency: string;
  pageSize: string;
};

export function createInventoryCommands(parent: Command): void {
  const inventory = new Command('inventory')
    .helpGroup('Discovery:')
    .description('Discovery commands for sites, pages and web content metadata')
    .option('--preflight', 'Run API surface preflight before executing inventory subcommands')
    .addHelpText(
      'after',
      `
Use these commands to discover IDs, URLs and keys before running export or import workflows.

Commands:
  sites        List accessible sites
  pages        List site pages
  page         Inspect one page
  structures   List journal structures
  templates    List web content templates
  where-used   Reverse lookup: pages that contain a fragment/widget/structure/template/adt
`,
    );

  inventory.hook('preAction', async (_thisCommand, actionCommand) => {
    if (actionCommand.name() === 'preflight') {
      return;
    }

    const options = actionCommand.optsWithGlobals<{preflight?: boolean; format?: string; strict?: boolean}>();
    if (!options.preflight) {
      return;
    }

    const context = createCommandContext(options);
    await runLiferayPreflight(context.config);
  });

  addOutputFormatOption(
    inventory
      .command('sites')
      .description('List accessible sites, or inspect one site folder/content inventory')
      .option('--page-size <pageSize>', 'Maximum JSONWS page size', '200')
      .option('--with-content', 'Include Journal content volume metrics')
      .option('--sort-by <field>', 'Sort by: site, name, content', 'site')
      .option('--limit <n>', 'Maximum number of sites to return when using content metrics', '10')
      .option('--site <site>', 'Inspect one site by friendly URL; switches to folder inventory mode')
      .option('--with-structures', 'When using --site or --group-id, include per-folder structure breakdowns')
      .option(
        '--exclude-site <site>',
        'Exclude a site friendly URL from content metrics (repeatable)',
        collect,
        [] as string[],
      )
      .option('--group-id <groupId>', 'Inspect one site by group ID; switches to folder inventory mode')
      .addHelpText(
        'after',
        `
Examples:
  ldev portal inventory sites
  ldev portal inventory sites --with-content --sort-by content
  ldev portal inventory sites --site /facultat-farmacia-alimentacio
  ldev portal inventory sites --site /facultat-farmacia-alimentacio --with-structures --limit 20

Notes:
  - Without --site/--group-id, this command lists sites.
  - With --site or --group-id, it switches to folder inventory for that site.
  - --with-structures is only meaningful in that scoped folder mode.
`,
      ),
  ).action(
    createFormattedAction<
      {
        pageSize: string;
        withContent?: boolean;
        sortBy?: string;
        limit: string;
        site?: string;
        withStructures?: boolean;
        excludeSite: string[];
        groupId?: string;
        format?: string;
        json?: boolean;
        ndjson?: boolean;
      },
      LiferayInventorySite[] | ContentStatsResult
    >(
      async (context, options): Promise<LiferayInventorySite[] | ContentStatsResult> => {
        const sortBy = (options.sortBy ?? 'site') as 'site' | 'name' | 'content';
        if (!['site', 'name', 'content'].includes(sortBy)) {
          throw new CliError('--sort-by must be one of: site, name, content.', {
            code: 'LIFERAY_INVENTORY_ERROR',
          });
        }

        if (options.site && options.groupId) {
          throw new CliError('Use either --site or --group-id, not both.', {
            code: 'LIFERAY_INVENTORY_ERROR',
          });
        }

        const groupId = options.groupId !== undefined ? Number.parseInt(options.groupId, 10) : undefined;
        if (options.groupId !== undefined && (!Number.isInteger(groupId) || groupId! <= 0)) {
          throw new CliError('--group-id must be a positive integer.', {
            code: 'LIFERAY_INVENTORY_ERROR',
          });
        }

        const limit = Number.parseInt(options.limit, 10);
        if (!Number.isInteger(limit) || limit < 0) {
          throw new CliError('--limit must be a non-negative integer.', {
            code: 'LIFERAY_INVENTORY_ERROR',
          });
        }

        if (options.withContent || sortBy === 'content' || options.site || groupId !== undefined) {
          return runContentStats(
            context.config,
            {
              site: options.site,
              groupId,
              limit,
              sortBy,
              excludeSites: options.excludeSite,
              withStructures: Boolean(options.withStructures),
            },
            {printer: context.printer},
          );
        }

        const sites = await runLiferayInventorySites(context.config, {
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        });

        if (sortBy === 'name') {
          return sites.slice().sort((left, right) => left.name.localeCompare(right.name));
        }

        return sites;
      },
      {text: formatInventorySitesResult},
    ),
  );

  addOutputFormatOption(
    inventory
      .command('pages')
      .description('List site pages as a navigable hierarchy')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--private-layout', 'List private pages instead of public pages')
      .option('--max-depth <maxDepth>', 'Maximum recursion depth', '12'),
  ).action(
    createFormattedAction(
      async (context, options: InventoryPagesCommandOptions) =>
        runLiferayInventoryPages(context.config, {
          site: options.site,
          privateLayout: Boolean(options.privateLayout),
          maxDepth: Number.parseInt(options.maxDepth, 10) || 12,
        }),
      {text: formatLiferayInventoryPages},
    ),
  );

  addOutputFormatOption(
    inventory
      .command('page')
      .description('Inspect a specific page or display page')
      .option('--url <url>', 'Full friendly URL like /web/guest/home or /web/guest/w/article')
      .option('--site <site>', 'Site friendly URL or numeric ID')
      .option('--friendly-url <friendlyUrl>', 'Friendly URL inside the site, like /home or /w/article')
      .option('--private-layout', 'Resolve the page as private when using --site + --friendly-url')
      .option('--full', 'Include expanded inspection details in JSON output')
      .option('--verbose', 'Show fragment/widget details: element name, CSS classes, custom CSS'),
  ).action(
    createFormattedAction(
      async (context, options: InventoryPageCommandOptions) =>
        runLiferayInventoryPage(
          context.config,
          resolveInventoryPageRequest({
            url: options.url,
            site: options.site,
            friendlyUrl: options.friendlyUrl,
            privateLayout: Boolean(options.privateLayout),
          }),
        ),
      (options: InventoryPageCommandOptions) => ({
        text: (result) => formatLiferayInventoryPage(result, Boolean(options.verbose)),
        json: (result) => projectLiferayInventoryPageJson(result, {full: Boolean(options.full)}),
      }),
    ),
  );

  addOutputFormatOption(
    inventory
      .command('structures')
      .description('List journal structures for a site or for all sites')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200')
      .option('--with-templates', 'Include associated templates for each structure')
      .option('--all-sites', 'List structures for all accessible sites in one run'),
  ).action(
    createFormattedAction(
      async (context, options: InventoryStructuresCommandOptions) => {
        const pageSize = Number.parseInt(options.pageSize, 10) || 200;

        if (options.allSites) {
          return runLiferayInventoryStructuresAllSites(context.config, {
            pageSize,
            withTemplates: Boolean(options.withTemplates),
          });
        }

        return runLiferayInventoryStructures(context.config, {
          site: options.site,
          pageSize,
          withTemplates: Boolean(options.withTemplates),
        });
      },
      {
        text: (result: LiferayInventoryStructuresResult) => formatLiferayInventoryStructures(result),
      },
    ),
  );

  addOutputFormatOption(
    inventory
      .command('templates')
      .description('List web content templates for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200'),
  ).action(
    createFormattedAction(
      async (context, options: InventoryTemplatesCommandOptions) =>
        runLiferayInventoryTemplates(context.config, {
          site: options.site,
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayInventoryTemplates},
    ),
  );

  addOutputFormatOption(
    inventory
      .command('where-used')
      .description('Reverse-lookup: list every page that contains a given fragment, widget, structure, template or ADT')
      .requiredOption('--type <type>', 'Resource type: fragment | widget | portlet | structure | template | adt')
      .option(
        '--key <key>',
        'Resource key to look up (repeat for OR-search across multiple keys)',
        collect,
        [] as string[],
      )
      .option('--site <site>', 'Limit lookup to a single site (defaults to scanning all accessible sites)')
      .option('--widget-type <widgetType>', 'ADT widget type filter used only when --type adt')
      .option('--class-name <className>', 'ADT class name filter used only when --type adt')
      .option('--include-private', 'Also scan private layouts')
      .option('--max-depth <maxDepth>', 'Maximum page tree recursion depth', '12')
      .option('--concurrency <n>', 'Parallel page fetches per site', '4')
      .option('--page-size <pageSize>', 'Headless page size for site listings', '200')
      .addHelpText(
        'after',
        `
Examples:
  ldev portal inventory where-used --type fragment --key card-hero
  ldev portal inventory where-used --type widget --key com_liferay_journal_content_web_portlet_JournalContentPortlet
  ldev portal inventory where-used --type structure --key BASIC --site /facultat-farmacia-alimentacio
  ldev portal inventory where-used --type adt --key UB_ADT_STUDIES_SEARCH --site /global
  ldev portal inventory where-used --type template --key NEWS_TEMPLATE --include-private --json

Notes:
  - The lookup walks the same data exposed by 'inventory page' so any reference visible there can be matched.
  - --key may be repeated to OR-match several keys in a single pass.
  - For widget/portlet lookups both the widgetName and the full portletId are matched.
  - For ADT lookups the key is resolved through the ADT catalog first, then matched by widget displayStyle on pages.
  - Pages that fail to load (e.g. permission errors) are reported under failedPages without aborting the run.
`,
      ),
  ).action(
    createFormattedAction(
      async (context, options: InventoryWhereUsedCommandOptions) =>
        runLiferayInventoryWhereUsed(context.config, {
          type: options.type as WhereUsedResourceType,
          keys: options.key,
          site: options.site,
          widgetType: options.widgetType,
          className: options.className,
          includePrivate: Boolean(options.includePrivate),
          maxDepth: Number.parseInt(options.maxDepth, 10) || 12,
          concurrency: Number.parseInt(options.concurrency, 10) || 4,
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayInventoryWhereUsed},
    ),
  );

  addOutputFormatOption(
    inventory
      .command('preflight')
      .description('Check availability of adminSite, adminUser and jsonws API surfaces')
      .option('--force-refresh', 'Bypass cached result and re-probe surfaces'),
    'text',
  ).action(
    createFormattedAction(
      async (context, options: InventoryPreflightCommandOptions) =>
        runLiferayPreflight(context.config, {forceRefresh: Boolean(options.forceRefresh)}),
      {text: formatLiferayPreflight},
    ),
  );

  parent.addCommand(inventory);
}
