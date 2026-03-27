import {Command} from 'commander';

import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {formatLiferayAuthToken, runLiferayAuthToken} from '../../features/liferay/liferay-auth.js';
import {formatLiferayHealth, runLiferayHealth} from '../../features/liferay/liferay-health.js';
import {formatLiferayInventoryPage, runLiferayInventoryPage} from '../../features/liferay/liferay-inventory-page.js';
import {formatLiferayInventoryPages, runLiferayInventoryPages} from '../../features/liferay/liferay-inventory-pages.js';
import {formatLiferayInventorySites, runLiferayInventorySites} from '../../features/liferay/liferay-inventory-sites.js';
import {formatLiferayInventoryStructures, runLiferayInventoryStructures} from '../../features/liferay/liferay-inventory-structures.js';
import {formatLiferayInventoryTemplates, runLiferayInventoryTemplates} from '../../features/liferay/liferay-inventory-templates.js';
import {formatLiferayPageLayoutDiff, runLiferayPageLayoutDiff} from '../../features/liferay/liferay-page-layout-diff.js';
import {runLiferayPageLayoutExport, writeLiferayPageLayoutExport} from '../../features/liferay/liferay-page-layout-export.js';
import {runLiferayResourceExportStructure} from '../../features/liferay/liferay-resource-export-structure.js';
import {runLiferayResourceExportTemplate} from '../../features/liferay/liferay-resource-export-template.js';
import {formatLiferayResourceExportAdts, runLiferayResourceExportAdts} from '../../features/liferay/liferay-resource-export-adts.js';
import {formatLiferayResourceExportFragments, runLiferayResourceExportFragments} from '../../features/liferay/liferay-resource-export-fragments.js';
import {formatLiferayResourceExportStructures, runLiferayResourceExportStructures} from '../../features/liferay/liferay-resource-export-structures.js';
import {
  formatLiferayResourceExportTemplates,
  getLiferayResourceExportTemplatesExitCode,
  runLiferayResourceExportTemplates,
} from '../../features/liferay/liferay-resource-export-templates.js';
import {formatLiferayResourceImportAdts, runLiferayResourceImportAdts} from '../../features/liferay/liferay-resource-import-adts.js';
import {formatLiferayResourceImportStructures, runLiferayResourceImportStructures} from '../../features/liferay/liferay-resource-import-structures.js';
import {formatLiferayResourceImportTemplates, runLiferayResourceImportTemplates} from '../../features/liferay/liferay-resource-import-templates.js';
import {formatLiferayResourceStructure, runLiferayResourceGetStructure} from '../../features/liferay/liferay-resource-get-structure.js';
import {formatLiferayResourceTemplate, runLiferayResourceGetTemplate} from '../../features/liferay/liferay-resource-get-template.js';
import {formatLiferayResourceAdts, runLiferayResourceListAdts} from '../../features/liferay/liferay-resource-list-adts.js';
import {formatLiferayResourceAdtTypes, runLiferayResourceListAdtTypes} from '../../features/liferay/liferay-resource-adt-types.js';
import {formatLiferayResourceFragments, runLiferayResourceListFragments} from '../../features/liferay/liferay-resource-list-fragments.js';
import {
  formatLiferayResourceMigrationPipeline,
  formatLiferayResourceMigrationRun,
  runLiferayResourceMigrationPipeline,
  runLiferayResourceMigrationRun,
} from '../../features/liferay/liferay-resource-migration.js';
import {
  formatLiferayResourceMigrationInit,
  runLiferayResourceMigrationInit,
} from '../../features/liferay/liferay-resource-migration-init.js';
import {formatLiferayResourceResolveAdt, runLiferayResourceResolveAdt} from '../../features/liferay/liferay-resource-resolve-adt.js';
import {formatLiferayResourceSyncAdt, runLiferayResourceSyncAdt} from '../../features/liferay/liferay-resource-sync-adt.js';
import {
  formatLiferayResourceSyncFragments,
  getLiferayResourceSyncFragmentsExitCode,
  runLiferayResourceSyncFragments,
} from '../../features/liferay/liferay-resource-sync-fragments.js';
import {formatLiferayResourceSyncStructure, runLiferayResourceSyncStructure} from '../../features/liferay/liferay-resource-sync-structure.js';
import {formatLiferayResourceSyncTemplate, runLiferayResourceSyncTemplate} from '../../features/liferay/liferay-resource-sync-template.js';

export function createLiferayCommand(): Command {
  const command = new Command('liferay');

  command
    .description('Liferay API CLI for inspection, export and controlled resource imports')
    .addHelpText('after', `
Use this namespace for explicit portal inspection and resource operations.
If you only need local runtime control, stay on the top-level commands.

Main groups:
  check        OAuth2 verification and basic API reachability
  auth         OAuth2 token retrieval for scripting
  inventory    Sites, pages, structures and templates
  page-layout  Export and diff of content pages
  resource     Resource export, import and controlled migrations
`);

  const auth = new Command('auth').description('OAuth2 token retrieval for scripting');
  auth.helpGroup('Connectivity and auth:');

  addOutputFormatOption(
    auth
      .command('token')
      .description('Fetch an OAuth2 access token for scripting')
      .option('--raw', 'Print only the access token in text format'),
  ).action(createFormattedAction(
    async (context) => runLiferayAuthToken(context.config),
    (options) => ({
      text: (result: Awaited<ReturnType<typeof runLiferayAuthToken>>) => formatLiferayAuthToken(result, {raw: Boolean(options.raw)}),
      json: (result: Awaited<ReturnType<typeof runLiferayAuthToken>>) => ({
        ...result,
        ...(options.raw ? {} : {accessToken: undefined}),
      }),
    }),
  ));

  command.addCommand(auth);

  addOutputFormatOption(
    command
      .command('check')
      .helpGroup('Connectivity and auth:')
      .description('Check OAuth2 auth and basic Liferay API reachability'),
  ).action(createFormattedAction(
    async (context) => runLiferayHealth(context.config),
    {text: formatLiferayHealth},
  ));

  const inventory = new Command('inventory')
    .helpGroup('Discovery:')
    .description('Discovery commands for sites, pages and web content metadata')
    .addHelpText('after', `
Use these commands to discover IDs, URLs and keys before running export or import workflows.

Commands:
  sites       List accessible sites
  pages       List site pages
  page        Inspect one page
  structures  List journal structures
  templates   List web content templates
`);

  addOutputFormatOption(
    inventory
      .command('sites')
      .description('List accessible sites')
      .option('--page-size <pageSize>', 'Maximum JSONWS page size', '200'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayInventorySites(context.config, {
      pageSize: Number.parseInt(options.pageSize, 10) || 200,
    }),
    {text: formatLiferayInventorySites},
  ));

  addOutputFormatOption(
    inventory
      .command('pages')
      .description('List site pages as a navigable hierarchy')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--private-layout', 'List private pages instead of public pages')
      .option('--max-depth <maxDepth>', 'Maximum recursion depth', '12'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayInventoryPages(context.config, {
      site: options.site,
      privateLayout: Boolean(options.privateLayout),
      maxDepth: Number.parseInt(options.maxDepth, 10) || 12,
    }),
    {text: formatLiferayInventoryPages},
  ));

  addOutputFormatOption(
    inventory
      .command('page')
      .description('Inspect a specific page or display page')
      .option('--url <url>', 'Full friendly URL like /web/guest/home or /web/guest/w/article')
      .option('--site <site>', 'Site friendly URL or numeric ID')
      .option('--friendly-url <friendlyUrl>', 'Friendly URL inside the site, like /home or /w/article')
      .option('--private-layout', 'Resolve the page as private when using --site + --friendly-url'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayInventoryPage(context.config, {
      url: options.url,
      site: options.site,
      friendlyUrl: options.friendlyUrl,
      privateLayout: Boolean(options.privateLayout),
    }),
    {text: formatLiferayInventoryPage},
  ));

  addOutputFormatOption(
    inventory
      .command('structures')
      .description('List journal structures for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayInventoryStructures(context.config, {
      site: options.site,
      pageSize: Number.parseInt(options.pageSize, 10) || 200,
    }),
    {text: formatLiferayInventoryStructures},
  ));

  addOutputFormatOption(
    inventory
      .command('templates')
      .description('List web content templates for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--page-size <pageSize>', 'Headless page size', '200'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayInventoryTemplates(context.config, {
      site: options.site,
      pageSize: Number.parseInt(options.pageSize, 10) || 200,
    }),
    {text: formatLiferayInventoryTemplates},
  ));

  command.addCommand(inventory);

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
  ).action(createFormattedAction(
    async (context, options) => runLiferayPageLayoutDiff(context.config, {
      url: options.url,
      file: options.file,
      referenceUrl: options.referenceUrl,
    }),
    {
      text: formatLiferayPageLayoutDiff,
      exitCode: (result) => result.equal ? 0 : 1,
    },
  ));

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
  ).action(createFormattedAction(
    async (context, options) => {
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
    (options) => ({
      text: (result) => 'outputPath' in result ? result.outputPath : JSON.stringify(result, null, 2),
    }),
  ));

  command.addCommand(pageLayout);

  const resource = new Command('resource')
    .helpGroup('Resource workflows:')
    .description('Read, export and import structured Liferay resources')
    .addHelpText('after', `
Use this namespace when you need stable file-based workflows for structures, templates, ADTs or fragments.

Read:
  structure, template, adts, adt-types, fragments, resolve-adt

Export:
  export-structure, export-template, export-structures, export-templates, export-adt, export-adts, export-fragment, export-fragments

Import:
  import-structure, import-template, import-adt, import-fragment, import-fragments, import-structures, import-templates, import-adts

Migration:
  migration-init, migration-run, migration-pipeline
`);

  addOutputFormatOption(
    resource
      .command('structure')
      .description('Read one journal structure by key or numeric id')
      .option('--key <key>', 'Data definition key or numeric id')
      .option('--id <id>', 'Numeric data definition id')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceGetStructure(context.config, {
      site: options.site,
      key: options.key,
      id: options.id,
    }),
    {text: formatLiferayResourceStructure},
  ));

  addOutputFormatOption(
    resource
      .command('template')
      .description('Read one journal template by id, key, ERC or visible name')
      .requiredOption('--id <id>', 'Template id, key, ERC or visible name')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceGetTemplate(context.config, {
      site: options.site,
      id: options.id,
    }),
    {text: formatLiferayResourceTemplate},
  ));

  addOutputFormatOption(
    resource
      .command('export-structure')
      .description('Export one journal structure JSON to a file or the default structures layout')
      .option('--key <key>', 'Data definition key or numeric id')
      .option('--id <id>', 'Numeric data definition id')
      .option('--output <file>', 'Destination JSON file; defaults to paths.structures/<site>/<key>.json')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--pretty', 'Pretty-print the JSON file output', true),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportStructure(context.config, {
      site: options.site,
      key: options.key,
      id: options.id,
      output: options.output,
      pretty: Boolean(options.pretty),
    }),
    {text: (result) => result.outputPath},
  ));

  addOutputFormatOption(
    resource
      .command('export-template')
      .description('Export one journal template FTL to a file or the default templates layout')
      .requiredOption('--id <id>', 'Template id, key, ERC or visible name')
      .option('--output <file>', 'Destination FTL file; defaults to paths.templates/<site>/<templateKey>.ftl')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportTemplate(context.config, {
      site: options.site,
      id: options.id,
      output: options.output,
    }),
    {text: (result) => result.outputPath},
  ));

  addOutputFormatOption(
    resource
      .command('export-structures')
      .description('Export all journal structures of a site into the local resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination base directory; defaults to paths.structures')
      .option('--all-sites', 'Export structures for every accessible site')
      .option('--check-only', 'Only report diffs against local files without writing them'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportStructures(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      checkOnly: Boolean(options.checkOnly),
    }),
    {text: formatLiferayResourceExportStructures},
  ));

  addOutputFormatOption(
    resource
      .command('export-templates')
      .description('Export all journal templates of a site into the local resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination base directory; defaults to paths.templates')
      .option('--all-sites', 'Export templates for every accessible site')
      .option('--continue-on-error', 'Continue exporting other templates if one entry fails'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportTemplates(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      continueOnError: Boolean(options.continueOnError),
    }),
    {
      text: formatLiferayResourceExportTemplates,
      exitCode: getLiferayResourceExportTemplatesExitCode,
    },
  ));

  addOutputFormatOption(
    resource
      .command('export-adt')
      .description('Export one ADT script to the local resource directory')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination directory; defaults to paths.adts/<site>')
      .option('--key <key>', 'ADT template key')
      .option('--name <name>', 'ADT visible name')
      .option('--widget-type <widgetType>', 'Widget type label used for known ADTs or local layout')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
      .option('--continue-on-error', 'Return success for partial failures'),
  ).action(createFormattedAction(
    async (context, options) => {
      if (!options.key && !options.name) {
        throw new Error('export-adt requiere --key o --name');
      }
      return runLiferayResourceExportAdts(context.config, {
        site: options.site,
        dir: options.dir,
        key: options.key,
        name: options.name,
        widgetType: options.widgetType,
        className: options.className,
        continueOnError: Boolean(options.continueOnError),
      });
    },
    {text: formatLiferayResourceExportAdts},
  ));

  addOutputFormatOption(
    resource
      .command('export-adts')
      .description('Export ADT scripts to the local resource directory')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination directory; defaults to paths.adts/<site>')
      .option('--all-sites', 'Export ADTs for every accessible site')
      .option('--key <key>', 'Export only one ADT by template key')
      .option('--name <name>', 'Export only one ADT by visible name')
      .option('--widget-type <widgetType>', 'Widget type label used for known ADTs or local layout')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
      .option('--continue-on-error', 'Continue exporting other ADTs if one entry fails'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportAdts(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      key: options.key,
      name: options.name,
      widgetType: options.widgetType,
      className: options.className,
      continueOnError: Boolean(options.continueOnError),
    }),
    {text: formatLiferayResourceExportAdts},
  ));

  addOutputFormatOption(
    resource
      .command('export-fragment')
      .description('Export one fragment into the local fragments project layout')
      .requiredOption('--fragment <fragment>', 'Fragment key or visible name')
      .option('--collection <collection>', 'Optional fragment collection key or name')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportFragments(context.config, {
      site: options.site,
      dir: options.dir,
      collection: options.collection,
      fragment: options.fragment,
    }),
    {text: formatLiferayResourceExportFragments},
  ));

  addOutputFormatOption(
    resource
      .command('export-fragments')
      .description('Export fragments of a site into the local fragments project layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--all-sites', 'Export fragments for every accessible site')
      .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>')
      .option('--collection <collection>', 'Export only one fragment collection by key or name')
      .option('--fragment <fragment>', 'Export only one fragment by key or name'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceExportFragments(context.config, {
      site: options.site,
      allSites: Boolean(options.allSites),
      dir: options.dir,
      collection: options.collection,
      fragment: options.fragment,
    }),
    {text: formatLiferayResourceExportFragments},
  ));

  addOutputFormatOption(
    resource
      .command('import-structure')
      .description('Import or validate a local journal structure JSON against the portal')
      .requiredOption('--key <key>', 'Data definition key')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--file <file>', 'Structure JSON file; autodetects by key if omitted')
      .option('--check-only', 'Preview only; do not update the structure')
      .option('--create-missing', 'Create the structure when it does not exist')
      .option('--skip-update', 'Skip the structure update after validation')
      .option('--migration-plan <file>', 'Migration plan JSON used to preserve data during the import')
      .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
      .option('--migration-dry-run', 'Do not persist structured content migration changes')
      .option('--cleanup-migration', 'Blank the source fields after mapping them')
      .option('--allow-breaking-change', 'Allow field removals without a migration plan'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceSyncStructure(context.config, {
      site: options.site,
      key: options.key,
      file: options.file,
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
      skipUpdate: Boolean(options.skipUpdate),
      migrationPlan: options.migrationPlan,
      migrationPhase: options.migrationPhase,
      migrationDryRun: Boolean(options.migrationDryRun),
      cleanupMigration: Boolean(options.cleanupMigration),
      allowBreakingChange: Boolean(options.allowBreakingChange),
    }),
    {text: formatLiferayResourceSyncStructure},
  ));

  addOutputFormatOption(
    resource
      .command('import-template')
      .description('Import or validate a local journal template FTL against the portal')
      .requiredOption('--id <id>', 'Template id, key, ERC or visible name')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--file <file>', 'Template FTL file; autodetects by id when omitted')
      .option('--structure-key <structureKey>', 'Required when creating a missing template')
      .option('--check-only', 'Preview only; do not update the template')
      .option('--create-missing', 'Create the template when it does not exist'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceSyncTemplate(context.config, {
      site: options.site,
      key: options.id,
      file: options.file,
      structureKey: options.structureKey,
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
    }),
    {text: formatLiferayResourceSyncTemplate},
  ));

  addOutputFormatOption(
    resource
      .command('import-adt')
      .description('Import or validate a local ADT FTL against the portal')
      .option('--key <key>', 'ADT key or visible name; inferred from --file when omitted')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--widget-type <widgetType>', 'ADT widget type; inferred from --file when omitted')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
      .option('--file <file>', 'ADT FTL file; recommended entrypoint')
      .option('--check-only', 'Preview only; do not update the ADT')
      .option('--create-missing', 'Create the ADT when it does not exist'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceSyncAdt(context.config, {
      site: options.site,
      key: options.key,
      widgetType: options.widgetType,
      className: options.className,
      file: options.file,
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
    }),
    {text: formatLiferayResourceSyncAdt},
  ));

  addOutputFormatOption(
    resource
      .command('import-fragment')
      .description('Import one local fragment into the portal using the fragments project layout')
      .requiredOption('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
      .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceSyncFragments(context.config, {
      site: options.site,
      groupId: options.siteId,
      dir: options.dir,
      fragment: options.fragment,
    }),
    {
      text: formatLiferayResourceSyncFragments,
      exitCode: getLiferayResourceSyncFragmentsExitCode,
    },
  ));

  addOutputFormatOption(
    resource
      .command('import-fragments')
      .description('Import local fragments into the portal using the fragments project layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
      .option('--all-sites', 'Import every local fragments site project found under the configured base')
      .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects')
      .option('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceSyncFragments(context.config, {
      site: options.site,
      groupId: options.siteId,
      allSites: Boolean(options.allSites),
      dir: options.dir,
      fragment: options.fragment,
    }),
    {
      text: formatLiferayResourceSyncFragments,
      exitCode: getLiferayResourceSyncFragmentsExitCode,
    },
  ));

  addOutputFormatOption(
    resource
      .command('import-structures')
      .description('Import all local journal structures from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.structures')
      .option('--all-sites', 'Import structures for every local site directory found')
      .option('--check-only', 'Preview only; do not update structures')
      .option('--create-missing', 'Create structures that do not exist')
      .option('--skip-update', 'Skip structure update after validation')
      .option('--migration-plan <file>', 'Migration plan JSON applied to every imported structure')
      .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
      .option('--migration-dry-run', 'Do not persist structured content migration changes')
      .option('--cleanup-migration', 'Blank source fields after mapping them')
      .option('--allow-breaking-change', 'Allow field removals without a migration plan'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceImportStructures(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
      skipUpdate: Boolean(options.skipUpdate),
      migrationPlan: options.migrationPlan,
      migrationPhase: options.migrationPhase,
      migrationDryRun: Boolean(options.migrationDryRun),
      cleanupMigration: Boolean(options.cleanupMigration),
      allowBreakingChange: Boolean(options.allowBreakingChange),
    }),
    {text: formatLiferayResourceImportStructures},
  ));

  addOutputFormatOption(
    resource
      .command('import-templates')
      .description('Import all local journal templates from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.templates')
      .option('--all-sites', 'Import templates for every local site directory found')
      .option('--check-only', 'Preview only; do not update templates')
      .option('--create-missing', 'Create templates that do not exist')
      .option('--structure-key <structureKey>', 'Structure key to use when creating missing templates'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceImportTemplates(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
      structureKey: options.structureKey,
    }),
    {text: formatLiferayResourceImportTemplates},
  ));

  addOutputFormatOption(
    resource
      .command('import-adts')
      .description('Import all local ADTs from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.adts')
      .option('--all-sites', 'Import ADTs for every local site directory found')
      .option('--widget-type <widgetType>', 'Optional widget type filter')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
      .option('--check-only', 'Preview only; do not update ADTs')
      .option('--create-missing', 'Create ADTs that do not exist'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceImportAdts(context.config, {
      site: options.site,
      dir: options.dir,
      allSites: Boolean(options.allSites),
      widgetType: options.widgetType,
      className: options.className,
      checkOnly: Boolean(options.checkOnly),
      createMissing: Boolean(options.createMissing),
    }),
    {text: formatLiferayResourceImportAdts},
  ));

  addOutputFormatOption(
    resource
      .command('migration-init')
      .description('Generate a base migration descriptor you can edit before running the migration')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--key <key>', 'Structure key')
      .option('--id <id>', 'Numeric structure id')
      .option('--file <file>', 'Local structure JSON; autodetects by key if omitted')
      .option('--output <file>', 'Destination migration descriptor; defaults to paths.migrations/<site>/<key>.migration.json')
      .option('--templates', 'Sync templates associated to the structure in migration-pipeline')
      .option('--overwrite', 'Overwrite an existing descriptor'),
    'json',
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceMigrationInit(context.config, {
      site: options.site,
      key: options.key,
      id: options.id,
      file: options.file,
      output: options.output,
      templates: Boolean(options.templates),
      overwrite: Boolean(options.overwrite),
    }),
    {text: formatLiferayResourceMigrationInit},
  ));

  addOutputFormatOption(
    resource
      .command('migration-run')
      .description('Execute a structure migration descriptor with a persisted migration plan')
      .requiredOption('--migration-file <file>', 'Migration descriptor JSON file')
      .option('--stage <stage>', 'Stage to run: introduce or cleanup', 'introduce')
      .option('--check-only', 'Validate only; do not mutate structures')
      .option('--migration-dry-run', 'Do not persist structured content migration updates')
      .option('--skip-update', 'Do not update the structure definition itself'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceMigrationRun(context.config, {
      migrationFile: options.migrationFile,
      stage: options.stage,
      checkOnly: Boolean(options.checkOnly),
      migrationDryRun: Boolean(options.migrationDryRun),
      skipUpdate: Boolean(options.skipUpdate),
    }),
    {text: formatLiferayResourceMigrationRun},
  ));

  addOutputFormatOption(
    resource
      .command('migration-pipeline')
      .description('Run the introduce phase and optionally the cleanup phase from a single descriptor')
      .requiredOption('--migration-file <file>', 'Migration descriptor JSON file')
      .option('--check-only', 'Validate only; do not mutate structures or templates')
      .option('--migration-dry-run', 'Do not persist structured content migration updates')
      .option('--run-cleanup', 'Execute the cleanup phase defined in the same descriptor')
      .option('--skip-validation', 'Skip the final check-only validation pass')
      .option('--create-missing-templates', 'Create descriptor templates when they do not exist'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceMigrationPipeline(context.config, {
      migrationFile: options.migrationFile,
      checkOnly: Boolean(options.checkOnly),
      migrationDryRun: Boolean(options.migrationDryRun),
      runCleanup: Boolean(options.runCleanup),
      skipValidation: Boolean(options.skipValidation),
      createMissingTemplates: Boolean(options.createMissingTemplates),
    }),
    {text: formatLiferayResourceMigrationPipeline},
  ));

  addOutputFormatOption(
    resource
      .command('resolve-adt')
      .description('Resolve an ADT by display style, id or name')
      .option('--site <site>', 'Site friendly URL or numeric ID; omit to search accessible sites')
      .option('--display-style <displayStyle>', 'Runtime display style like ddmTemplate_19690804')
      .option('--id <id>', 'Numeric template id')
      .option('--name <name>', 'Template key, ERC or visible name')
      .option('--widget-type <widgetType>', 'Optional widget type filter')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceResolveAdt(context.config, {
      site: options.site,
      displayStyle: options.displayStyle,
      id: options.id,
      name: options.name,
      widgetType: options.widgetType,
      className: options.className,
    }),
    {text: formatLiferayResourceResolveAdt},
  ));

  addOutputFormatOption(
    resource
      .command('adt-types')
      .description('List the built-in ADT widget type to Java class mappings bundled with the CLI'),
  ).action(createFormattedAction(
    async () => runLiferayResourceListAdtTypes(),
    {text: formatLiferayResourceAdtTypes},
  ));

  addOutputFormatOption(
    resource
      .command('adts')
      .description('List application display templates for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--widget-type <widgetType>', 'Optional widget type filter')
      .option('--class-name <className>', 'Explicit Java class name to query when the widget type is not in the built-in map')
      .option('--include-script', 'Include template script in JSON output'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceListAdts(context.config, {
      site: options.site,
      widgetType: options.widgetType,
      className: options.className,
      includeScript: Boolean(options.includeScript),
    }),
    {text: formatLiferayResourceAdts},
  ));

  addOutputFormatOption(
    resource
      .command('fragments')
      .description('List fragment collections and fragment entries for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
  ).action(createFormattedAction(
    async (context, options) => runLiferayResourceListFragments(context.config, {
      site: options.site,
    }),
    {text: formatLiferayResourceFragments},
  ));

  command.addCommand(resource);

  return command;
}
