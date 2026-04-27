import type {Command} from 'commander';

import {
  collectRepeatableOption,
  registerResourceWorkflow,
  repeatableValues,
  requireResourceValue,
} from './resource-workflow.js';
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

export function registerResourceImportCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'import-structure',
    description: 'Import or validate a local journal structure JSON against the portal',
    configure: (command) =>
      command
        .option('--structure <structure>', 'Structure key')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--file <file>', 'Structure JSON file; autodetects by structure key if omitted')
        .option('--check-only', 'Preview only; do not update the structure')
        .option('--create-missing', 'Create the structure when it does not exist')
        .option('--skip-update', 'Skip the structure update after validation')
        .option('--migration-plan <file>', 'Migration plan JSON used to preserve data during the import')
        .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
        .option('--migration-dry-run', 'Do not persist structured content migration changes')
        .option('--cleanup-migration', 'Blank the source fields after mapping them')
        .option('--allow-breaking-change', 'Allow field removals without a migration plan'),
    run: async (context, options) =>
      runLiferayResourceSyncStructure(context.config, {
        site: options.site,
        key: requireResourceValue(options.structure as string | undefined, 'import-structure requires --structure'),
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
    render: {text: formatLiferayResourceSyncStructure},
  });

  registerResourceWorkflow(resource, {
    name: 'import-template',
    description: 'Import or validate a local journal template FTL against the portal',
    configure: (command) =>
      command
        .option('--template <template>', 'Template key, ERC, numeric id, or visible name')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--file <file>', 'Template FTL file; autodetects by template when omitted')
        .option('--structure <structure>', 'Structure key to use when creating a missing template')
        .option('--check-only', 'Preview only; do not update the template')
        .option('--create-missing', 'Create the template when it does not exist'),
    run: async (context, options) =>
      runLiferayResourceSyncTemplate(context.config, {
        site: options.site,
        key: requireResourceValue(options.template as string | undefined, 'import-template requires --template'),
        file: options.file,
        structureKey: options.structure as string | undefined,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
      }),
    render: {text: formatLiferayResourceSyncTemplate},
  });

  registerResourceWorkflow(resource, {
    name: 'import-adt',
    description: 'Import or validate a local ADT FTL against the portal',
    configure: (command) =>
      command
        .option('--adt <adt>', 'ADT key or visible name; inferred from --file when omitted')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--widget-type <widgetType>', 'ADT widget type; inferred from --file when omitted')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        )
        .option('--file <file>', 'ADT FTL file; recommended entrypoint')
        .option('--check-only', 'Preview only; do not update the ADT')
        .option('--create-missing', 'Create the ADT when it does not exist'),
    run: async (context, options) =>
      runLiferayResourceSyncAdt(context.config, {
        site: options.site,
        key: Array.isArray(options.adt) ? options.adt[0] : options.adt,
        widgetType: options.widgetType,
        className: options.className,
        file: options.file,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
      }),
    render: {text: formatLiferayResourceSyncAdt},
  });

  registerResourceWorkflow(resource, {
    name: 'import-fragment',
    description: 'Import one local fragment into the portal using the fragments project layout',
    configure: (command) =>
      command
        .requiredOption('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
        .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects'),
    run: async (context, options) =>
      runLiferayResourceSyncFragments(context.config, {
        site: options.site,
        groupId: options.siteId,
        dir: options.dir,
        fragment: options.fragment,
      }),
    render: {
      text: formatLiferayResourceSyncFragments,
      exitCode: getLiferayResourceSyncFragmentsExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'import-fragments',
    description: 'Import local fragments into the portal using the fragments project layout',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
        .option('--all-sites', 'Import every local fragments site project found under the configured base')
        .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects')
        .option('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import'),
    run: async (context, options) =>
      runLiferayResourceSyncFragments(context.config, {
        site: options.site,
        groupId: options.siteId,
        allSites: Boolean(options.allSites),
        dir: options.dir,
        fragment: options.fragment,
      }),
    render: {
      text: formatLiferayResourceSyncFragments,
      exitCode: getLiferayResourceSyncFragmentsExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'import-structures',
    description: 'Import local journal structures from the configured resource layout',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Source base directory; defaults to paths.structures')
        .option(
          '--structure <key>',
          'Structure key/ERC/file basename to import; repeatable',
          collectRepeatableOption,
          [],
        )
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
    run: async (context, options) =>
      runLiferayResourceImportStructures(context.config, {
        site: options.site,
        dir: options.dir,
        apply: Boolean(options.apply),
        structureKeys: repeatableValues(options.structure),
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
    render: {text: formatLiferayResourceImportStructures, exitCode: getLiferayResourceImportStructuresExitCode},
  });

  registerResourceWorkflow(resource, {
    name: 'import-templates',
    description: 'Import local journal templates from the configured resource layout',
    configure: (command) =>
      command
        .showHelpAfterError(
          '(use --template <key> one or more times, --apply for the resolved site, or --all-sites for every site)',
        )
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Source base directory; defaults to paths.templates')
        .option('--template <key>', 'Template key/ERC/name to import; repeatable', collectRepeatableOption, [])
        .option('--apply', 'Import every local template for the resolved site')
        .option('--all-sites', 'Import templates for every local site directory found')
        .option('--check-only', 'Preview only; do not update templates')
        .option('--create-missing', 'Create templates that do not exist')
        .option('--structure <structure>', 'Structure key to use when creating missing templates')
        .option('--continue-on-error', 'Continue importing other templates if one entry fails'),
    run: async (context, options) =>
      runLiferayResourceImportTemplates(context.config, {
        site: options.site,
        dir: options.dir,
        apply: Boolean(options.apply),
        allSites: Boolean(options.allSites),
        templateKeys: repeatableValues(options.template),
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
        structureKey: options.structure as string | undefined,
        continueOnError: Boolean(options.continueOnError),
      }),
    render: {text: formatLiferayResourceImportTemplates, exitCode: getLiferayResourceImportTemplatesExitCode},
  });

  registerResourceWorkflow(resource, {
    name: 'import-adts',
    description: 'Import local ADTs from the configured resource layout',
    configure: (command) =>
      command
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
    run: async (context, options) =>
      runLiferayResourceImportAdts(context.config, {
        site: options.site,
        dir: options.dir,
        apply: Boolean(options.apply),
        adtKeys: repeatableValues(options.adt),
        allSites: Boolean(options.allSites),
        widgetType: options.widgetType,
        className: options.className,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
        continueOnError: Boolean(options.continueOnError),
      }),
    render: {text: formatLiferayResourceImportAdts, exitCode: getLiferayResourceImportAdtsExitCode},
  });
}
