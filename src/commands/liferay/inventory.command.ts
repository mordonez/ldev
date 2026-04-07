import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {
  formatLiferayInventoryPage,
  runLiferayInventoryPage,
} from '../../features/liferay/inventory/liferay-inventory-page.js';
import {
  formatLiferayInventoryPages,
  runLiferayInventoryPages,
} from '../../features/liferay/inventory/liferay-inventory-pages.js';
import {
  formatLiferayInventorySites,
  runLiferayInventorySites,
} from '../../features/liferay/inventory/liferay-inventory-sites.js';
import {
  formatLiferayInventoryStructures,
  runLiferayInventoryStructures,
} from '../../features/liferay/inventory/liferay-inventory-structures.js';
import {
  formatLiferayInventoryTemplates,
  runLiferayInventoryTemplates,
} from '../../features/liferay/inventory/liferay-inventory-templates.js';

export function createInventoryCommands(parent: Command): void {
  const inventory = new Command('inventory')
    .helpGroup('Discovery:')
    .description('Discovery commands for sites, pages and web content metadata')
    .addHelpText(
      'after',
      `
Use these commands to discover IDs, URLs and keys before running export or import workflows.

Commands:
  sites       List accessible sites
  pages       List site pages
  page        Inspect one page
  structures  List journal structures
  templates   List web content templates
`,
    );

  addOutputFormatOption(
    inventory
      .command('sites')
      .description('List accessible sites')
      .option('--page-size <pageSize>', 'Maximum JSONWS page size', '200'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayInventorySites(context.config, {
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayInventorySites},
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
      async (context, options) =>
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
      .option('--verbose', 'Show fragment/widget details: element name, CSS classes, custom CSS'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayInventoryPage(context.config, {
          url: options.url,
          site: options.site,
          friendlyUrl: options.friendlyUrl,
          privateLayout: Boolean(options.privateLayout),
          verbose: Boolean(options.verbose),
        }),
      (options) => ({text: (result) => formatLiferayInventoryPage(result, Boolean(options.verbose))}),
    ),
  );

  addOutputFormatOption(
    inventory
      .command('structures')
      .description('List journal structures for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayInventoryStructures(context.config, {
          site: options.site,
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayInventoryStructures},
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
      async (context, options) =>
        runLiferayInventoryTemplates(context.config, {
          site: options.site,
          pageSize: Number.parseInt(options.pageSize, 10) || 200,
        }),
      {text: formatLiferayInventoryTemplates},
    ),
  );

  parent.addCommand(inventory);
}
