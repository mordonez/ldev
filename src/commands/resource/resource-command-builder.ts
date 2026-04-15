import {Command} from 'commander';

import {createCommandContext} from '../../cli/command-context.js';
import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {runLiferayPreflight} from '../../features/liferay/liferay-preflight.js';
import {runLiferayResourceExportStructure} from '../../features/liferay/resource/liferay-resource-export-structure.js';
import {runLiferayResourceExportTemplate} from '../../features/liferay/resource/liferay-resource-export-template.js';
import {
  formatLiferayResourceExportAdts,
  runLiferayResourceExportAdts,
} from '../../features/liferay/resource/liferay-resource-export-adts.js';
import {
  formatLiferayResourceExportFragments,
  runLiferayResourceExportFragments,
} from '../../features/liferay/resource/liferay-resource-export-fragments.js';
import {
  formatLiferayResourceExportStructures,
  runLiferayResourceExportStructures,
} from '../../features/liferay/resource/liferay-resource-export-structures.js';
import {
  formatLiferayResourceExportTemplates,
  getLiferayResourceExportTemplatesExitCode,
  runLiferayResourceExportTemplates,
} from '../../features/liferay/resource/liferay-resource-export-templates.js';
import {
  formatLiferayResourceImportAdts,
  getLiferayResourceImportAdtsExitCode,
  runLiferayResourceImportAdts,
} from '../../features/liferay/resource/liferay-resource-import-adts.js';
import {
  formatLiferayResourceImportStructures,
  getLiferayResourceImportStructuresExitCode,
  runLiferayResourceImportStructures,
} from '../../features/liferay/resource/liferay-resource-import-structures.js';
import {
  formatLiferayResourceImportTemplates,
  getLiferayResourceImportTemplatesExitCode,
  runLiferayResourceImportTemplates,
} from '../../features/liferay/resource/liferay-resource-import-templates.js';
import {
  formatLiferayResourceAdt,
  runLiferayResourceGetAdt,
} from '../../features/liferay/resource/liferay-resource-get-adt.js';
import {
  formatLiferayResourceStructure,
  runLiferayResourceGetStructure,
} from '../../features/liferay/resource/liferay-resource-get-structure.js';
import {
  formatLiferayResourceTemplate,
  runLiferayResourceGetTemplate,
} from '../../features/liferay/resource/liferay-resource-get-template.js';
import {
  formatLiferayResourceAdts,
  runLiferayResourceListAdts,
} from '../../features/liferay/resource/liferay-resource-list-adts.js';
import {
  formatLiferayResourceFragments,
  runLiferayResourceListFragments,
} from '../../features/liferay/resource/liferay-resource-list-fragments.js';
import {
  formatLiferayResourceMigrationPipeline,
  formatLiferayResourceMigrationRun,
  runLiferayResourceMigrationPipeline,
  runLiferayResourceMigrationRun,
} from '../../features/liferay/resource/liferay-resource-migration.js';
import {
  formatLiferayResourceMigrationInit,
  runLiferayResourceMigrationInit,
} from '../../features/liferay/resource/liferay-resource-migration-init.js';
import {
  formatLiferayResourceSyncAdt,
  runLiferayResourceSyncAdt,
} from '../../features/liferay/resource/liferay-resource-sync-adt.js';
import {
  formatLiferayResourceSyncFragments,
  getLiferayResourceSyncFragmentsExitCode,
  runLiferayResourceSyncFragments,
} from '../../features/liferay/resource/liferay-resource-sync-fragments.js';
import {
  formatLiferayResourceSyncStructure,
  runLiferayResourceSyncStructure,
} from '../../features/liferay/resource/liferay-resource-sync-structure.js';
import {
  formatLiferayResourceSyncTemplate,
  runLiferayResourceSyncTemplate,
} from '../../features/liferay/resource/liferay-resource-sync-template.js';

export type ResourceCommandOptions = {
  description: string;
  helpText: string;
  helpGroup?: string;
};

export function buildResourceCommand(options: ResourceCommandOptions): Command {
  const resource = new Command('resource')
    .description(options.description)
    .option('--preflight', 'Run API surface preflight before executing resource subcommands')
    .addHelpText('after', options.helpText);

  if (options.helpGroup) {
    resource.helpGroup(options.helpGroup);
  }

  resource.hook('preAction', async (_thisCommand, actionCommand) => {
    const options = actionCommand.optsWithGlobals<{preflight?: boolean; format?: string; strict?: boolean}>();
    if (!options.preflight) {
      return;
    }

    const context = createCommandContext(options);
    await runLiferayPreflight(context.config);
  });

  addOutputFormatOption(
    resource
      .command('structure')
      .description('Read one journal structure by key or numeric id')
      .option('--key <key>', 'Data definition key or numeric id')
      .option('--id <id>', 'Numeric data definition id')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceGetStructure(context.config, {
          site: options.site,
          key: options.key,
          id: options.id,
        }),
      {text: formatLiferayResourceStructure},
    ),
  );

  addOutputFormatOption(
    resource
      .command('template')
      .description('Read one journal template by id, key, ERC or visible name')
      .requiredOption('--id <id>', 'Template id, key, ERC or visible name')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceGetTemplate(context.config, {
          site: options.site,
          id: options.id,
        }),
      {text: formatLiferayResourceTemplate},
    ),
  );

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
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportStructure(context.config, {
          site: options.site,
          key: options.key,
          id: options.id,
          output: options.output,
          pretty: Boolean(options.pretty),
        }),
      {text: (result) => result.outputPath},
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-template')
      .description('Export one journal template FTL to a file or the default templates layout')
      .requiredOption('--id <id>', 'Template id, key, ERC or visible name')
      .option('--output <file>', 'Destination FTL file; defaults to paths.templates/<site>/<templateKey>.ftl')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportTemplate(context.config, {
          site: options.site,
          id: options.id,
          output: options.output,
        }),
      {text: (result) => result.outputPath},
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-structures')
      .description('Export all journal structures of a site into the local resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination base directory; defaults to paths.structures')
      .option('--all-sites', 'Export structures for every accessible site')
      .option('--check-only', 'Only report diffs against local files without writing them'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportStructures(context.config, {
          site: options.site,
          dir: options.dir,
          allSites: Boolean(options.allSites),
          checkOnly: Boolean(options.checkOnly),
        }),
      {text: formatLiferayResourceExportStructures},
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-templates')
      .description('Export all journal templates of a site into the local resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination base directory; defaults to paths.templates')
      .option('--all-sites', 'Export templates for every accessible site')
      .option('--debug', 'Show which enumeration source was used and how many templates each source returned')
      .option('--continue-on-error', 'Continue exporting other templates if one entry fails'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportTemplates(context.config, {
          site: options.site,
          dir: options.dir,
          allSites: Boolean(options.allSites),
          debug: Boolean(options.debug),
          continueOnError: Boolean(options.continueOnError),
        }),
      {
        text: formatLiferayResourceExportTemplates,
        exitCode: getLiferayResourceExportTemplatesExitCode,
      },
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-adt')
      .description('Export one ADT script to the local resource directory')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination directory; defaults to paths.adts/<site>')
      .option('--key <key>', 'ADT template key')
      .option('--name <name>', 'ADT visible name')
      .option('--widget-type <widgetType>', 'Widget type label used for known ADTs or local layout')
      .option(
        '--class-name <className>',
        'Explicit Java class name to query when the widget type is not in the built-in map',
      )
      .option('--continue-on-error', 'Return success for partial failures'),
  ).action(
    createFormattedAction(
      async (context, options) => {
        if (!options.key && !options.name) {
          throw new Error('export-adt requires --key or --name');
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
    ),
  );

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
      .option(
        '--class-name <className>',
        'Explicit Java class name to query when the widget type is not in the built-in map',
      )
      .option('--continue-on-error', 'Continue exporting other ADTs if one entry fails'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportAdts(context.config, {
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
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-fragment')
      .description('Export one fragment into the local fragments project layout')
      .requiredOption('--fragment <fragment>', 'Fragment key or visible name')
      .option('--collection <collection>', 'Optional fragment collection key or name')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportFragments(context.config, {
          site: options.site,
          dir: options.dir,
          collection: options.collection,
          fragment: options.fragment,
        }),
      {text: formatLiferayResourceExportFragments},
    ),
  );

  addOutputFormatOption(
    resource
      .command('export-fragments')
      .description('Export fragments of a site into the local fragments project layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--all-sites', 'Export fragments for every accessible site')
      .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>')
      .option('--collection <collection>', 'Export only one fragment collection by key or name')
      .option('--fragment <fragment>', 'Export only one fragment by key or name'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceExportFragments(context.config, {
          site: options.site,
          allSites: Boolean(options.allSites),
          dir: options.dir,
          collection: options.collection,
          fragment: options.fragment,
        }),
      {text: formatLiferayResourceExportFragments},
    ),
  );

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
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceSyncStructure(context.config, {
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
    ),
  );

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
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceSyncTemplate(context.config, {
          site: options.site,
          key: options.id,
          file: options.file,
          structureKey: options.structureKey,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissing),
        }),
      {text: formatLiferayResourceSyncTemplate},
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-adt')
      .description('Import or validate a local ADT FTL against the portal')
      .option('--key <key>', 'ADT key or visible name; inferred from --file when omitted')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--widget-type <widgetType>', 'ADT widget type; inferred from --file when omitted')
      .option(
        '--class-name <className>',
        'Explicit Java class name to query when the widget type is not in the built-in map',
      )
      .option('--file <file>', 'ADT FTL file; recommended entrypoint')
      .option('--check-only', 'Preview only; do not update the ADT')
      .option('--create-missing', 'Create the ADT when it does not exist'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceSyncAdt(context.config, {
          site: options.site,
          key: options.key,
          widgetType: options.widgetType,
          className: options.className,
          file: options.file,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissing),
        }),
      {text: formatLiferayResourceSyncAdt},
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-fragment')
      .description('Import one local fragment into the portal using the fragments project layout')
      .requiredOption('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
      .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceSyncFragments(context.config, {
          site: options.site,
          groupId: options.siteId,
          dir: options.dir,
          fragment: options.fragment,
        }),
      {
        text: formatLiferayResourceSyncFragments,
        exitCode: getLiferayResourceSyncFragmentsExitCode,
      },
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-fragments')
      .description('Import local fragments into the portal using the fragments project layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
      .option('--all-sites', 'Import every local fragments site project found under the configured base')
      .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects')
      .option('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceSyncFragments(context.config, {
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
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-structures')
      .description('Import local journal structures from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.structures')
      .option('--structure <key>', 'Structure key/ERC/file basename to import; repeatable', collectRepeatableOption, [])
      .option('--apply', 'Import every local structure for the resolved site')
      .option('--all-sites', 'Import structures for every local site directory found')
      .option('--check-only', 'Preview only; do not update structures')
      .option('--create-missing', 'Create structures that do not exist')
      .option('--skip-update', 'Skip structure update after validation')
      .option('--migration-plan <file>', 'Migration plan JSON applied to every imported structure')
      .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
      .option('--migration-dry-run', 'Do not persist structured content migration changes')
      .option('--cleanup-migration', 'Blank source fields after mapping them')
      .option('--allow-breaking-change', 'Allow field removals without a migration plan')
      .option('--continue-on-error', 'Continue importing other structures if one entry fails'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceImportStructures(context.config, {
          site: options.site,
          dir: options.dir,
          apply: Boolean(options.apply),
          structureKeys: options.structure,
          allSites: Boolean(options.allSites),
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissing),
          skipUpdate: Boolean(options.skipUpdate),
          migrationPlan: options.migrationPlan,
          migrationPhase: options.migrationPhase,
          migrationDryRun: Boolean(options.migrationDryRun),
          cleanupMigration: Boolean(options.cleanupMigration),
          allowBreakingChange: Boolean(options.allowBreakingChange),
          continueOnError: Boolean(options.continueOnError),
        }),
      {text: formatLiferayResourceImportStructures, exitCode: getLiferayResourceImportStructuresExitCode},
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-templates')
      .showHelpAfterError(
        '(use --template <key> one or more times, --apply for the resolved site, or --all-sites for every site)',
      )
      .description('Import local journal templates from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.templates')
      .option('--template <key>', 'Template key/ERC/name to import; repeatable', collectRepeatableOption, [])
      .option('--apply', 'Import every local template for the resolved site')
      .option('--all-sites', 'Import templates for every local site directory found')
      .option('--check-only', 'Preview only; do not update templates')
      .option('--create-missing', 'Create templates that do not exist')
      .option('--structure-key <structureKey>', 'Structure key to use when creating missing templates')
      .option('--continue-on-error', 'Continue importing other templates if one entry fails'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceImportTemplates(context.config, {
          site: options.site,
          dir: options.dir,
          apply: Boolean(options.apply),
          allSites: Boolean(options.allSites),
          templateKeys: options.template,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissing),
          structureKey: options.structureKey,
          continueOnError: Boolean(options.continueOnError),
        }),
      {text: formatLiferayResourceImportTemplates, exitCode: getLiferayResourceImportTemplatesExitCode},
    ),
  );

  addOutputFormatOption(
    resource
      .command('import-adts')
      .description('Import local ADTs from the configured resource layout')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--dir <dir>', 'Source base directory; defaults to paths.adts')
      .option('--adt <key>', 'ADT key/file basename to import; repeatable', collectRepeatableOption, [])
      .option('--apply', 'Import every local ADT for the resolved site')
      .option('--all-sites', 'Import ADTs for every local site directory found')
      .option('--widget-type <widgetType>', 'Widget type filter')
      .option(
        '--class-name <className>',
        'Explicit Java class name filter when the widget type is not in the built-in map',
      )
      .option('--check-only', 'Preview only; do not update ADTs')
      .option('--create-missing', 'Create ADTs that do not exist')
      .option('--continue-on-error', 'Continue importing other ADTs if one entry fails'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceImportAdts(context.config, {
          site: options.site,
          dir: options.dir,
          apply: Boolean(options.apply),
          adtKeys: options.adt,
          allSites: Boolean(options.allSites),
          widgetType: options.widgetType,
          className: options.className,
          checkOnly: Boolean(options.checkOnly),
          createMissing: Boolean(options.createMissing),
          continueOnError: Boolean(options.continueOnError),
        }),
      {text: formatLiferayResourceImportAdts, exitCode: getLiferayResourceImportAdtsExitCode},
    ),
  );

  addOutputFormatOption(
    resource
      .command('migration-init')
      .description('Generate a base migration descriptor you can edit before running the migration')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--key <key>', 'Structure key')
      .option('--id <id>', 'Numeric structure id')
      .option('--file <file>', 'Local structure JSON; autodetects by key if omitted')
      .option(
        '--output <file>',
        'Destination migration descriptor; defaults to paths.migrations/<site>/<key>.migration.json',
      )
      .option('--templates', 'Sync templates associated to the structure in migration-pipeline')
      .option('--overwrite', 'Overwrite an existing descriptor'),
    'json',
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceMigrationInit(context.config, {
          site: options.site,
          key: options.key,
          id: options.id,
          file: options.file,
          output: options.output,
          templates: Boolean(options.templates),
          overwrite: Boolean(options.overwrite),
        }),
      {text: formatLiferayResourceMigrationInit},
    ),
  );

  addOutputFormatOption(
    resource
      .command('migration-run')
      .description('Execute a structure migration descriptor with a persisted migration plan')
      .requiredOption('--migration-file <file>', 'Migration descriptor JSON file')
      .option('--stage <stage>', 'Stage to run: introduce or cleanup', 'introduce')
      .option('--check-only', 'Validate only; do not mutate structures')
      .option('--migration-dry-run', 'Do not persist structured content migration updates')
      .option('--skip-update', 'Do not update the structure definition itself'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceMigrationRun(context.config, {
          migrationFile: options.migrationFile,
          stage: options.stage,
          checkOnly: Boolean(options.checkOnly),
          migrationDryRun: Boolean(options.migrationDryRun),
          skipUpdate: Boolean(options.skipUpdate),
        }),
      {text: formatLiferayResourceMigrationRun},
    ),
  );

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
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceMigrationPipeline(context.config, {
          migrationFile: options.migrationFile,
          checkOnly: Boolean(options.checkOnly),
          migrationDryRun: Boolean(options.migrationDryRun),
          runCleanup: Boolean(options.runCleanup),
          skipValidation: Boolean(options.skipValidation),
          createMissingTemplates: Boolean(options.createMissingTemplates),
        }),
      {text: formatLiferayResourceMigrationPipeline},
    ),
  );

  addOutputFormatOption(
    resource
      .command('adt')
      .description('Inspect one ADT in detail')
      .option('--site <site>', 'Site friendly URL or numeric ID; omit to search accessible sites')
      .option('--display-style <displayStyle>', 'Runtime display style like ddmTemplate_19690804')
      .option('--id <id>', 'Numeric template id')
      .option('--key <key>', 'ADT template key')
      .option('--name <name>', 'ADT visible name')
      .option('--widget-type <widgetType>', 'Optional widget type filter')
      .option(
        '--class-name <className>',
        'Explicit Java class name to query when the widget type is not in the built-in map',
      ),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceGetAdt(context.config, {
          site: options.site,
          displayStyle: options.displayStyle,
          id: options.id,
          key: options.key,
          name: options.name,
          widgetType: options.widgetType,
          className: options.className,
        }),
      {text: formatLiferayResourceAdt},
    ),
  );

  addOutputFormatOption(
    resource
      .command('adts')
      .description('List application display templates for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
      .option('--widget-type <widgetType>', 'Optional widget type filter')
      .option(
        '--class-name <className>',
        'Explicit Java class name to query when the widget type is not in the built-in map',
      )
      .option('--include-script', 'Include template script in JSON output'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceListAdts(context.config, {
          site: options.site,
          widgetType: options.widgetType,
          className: options.className,
          includeScript: Boolean(options.includeScript),
        }),
      {text: formatLiferayResourceAdts},
    ),
  );

  addOutputFormatOption(
    resource
      .command('fragments')
      .description('List fragment collections and fragment entries for a site')
      .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
  ).action(
    createFormattedAction(
      async (context, options) =>
        runLiferayResourceListFragments(context.config, {
          site: options.site,
        }),
      {text: formatLiferayResourceFragments},
    ),
  );

  return resource;
}

function collectRepeatableOption(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}
