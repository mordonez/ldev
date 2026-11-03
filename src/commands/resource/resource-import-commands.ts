import {InvalidArgumentError, type Command} from 'commander';

import {
  collectRepeatableOption,
  configure,
  o,
  registerResourceWorkflow,
  repeatableValues,
  requireResourceValue,
} from './resource.command.js';
import {
  formatLiferayResourceImportResult,
  getLiferayResourceImportExitCode,
} from '../../features/liferay/resource/liferay-resource-import-shared.js';
import {
  runLiferayResourceImportAdts,
  runLiferayResourceImportStructures,
  runLiferayResourceImportTemplates,
} from '../../features/liferay/resource/liferay-resource-import-bulk.js';
import {
  formatLiferayResourceImportAdt,
  runLiferayResourceImportAdt,
} from '../../features/liferay/resource/liferay-resource-import-adt.js';
import {
  formatLiferayResourceImportFragments,
  getLiferayResourceImportFragmentsExitCode,
  runLiferayResourceImportFragments,
} from '../../features/liferay/resource/liferay-resource-import-fragments.js';
import {
  formatLiferayResourceImportObject,
  runLiferayResourceImportObject,
} from '../../features/liferay/resource/liferay-resource-import-object.js';
import {
  formatLiferayResourceImportPicklist,
  runLiferayResourceImportPicklist,
} from '../../features/liferay/resource/liferay-resource-import-picklist.js';
import {
  formatApplySiteInitializer,
  runApplySiteInitializer,
} from '../../features/liferay/site-initializer/site-initializer-apply.js';
import {
  formatLiferayRedirectsImport,
  runLiferayRedirectsImport,
} from '../../features/liferay/redirects/liferay-redirects-import.js';
import {
  formatLiferayStyleBookImport,
  runLiferayResourceImportStyleBook,
} from '../../features/liferay/resource/liferay-resource-style-book.js';
import {
  formatLiferayResourceImportStructure,
  runLiferayResourceImportStructure,
} from '../../features/liferay/resource/liferay-resource-import-structure.js';
import {
  formatLiferayResourceImportTemplate,
  runLiferayResourceImportTemplate,
} from '../../features/liferay/resource/liferay-resource-import-template.js';

type FragmentImportTransport = 'auto' | 'jsonws' | 'deploy-zip';

function parseFragmentImportTransport(value: string): FragmentImportTransport {
  if (value === 'auto' || value === 'jsonws' || value === 'deploy-zip') {
    return value;
  }

  throw new InvalidArgumentError('Expected one of: auto, jsonws, deploy-zip');
}

export function registerResourceImportCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'import-structure',
    description: 'Import or validate a local journal structure JSON against the portal',
    configure: configure(o.site(), o.checkOnly(), (cmd) =>
      cmd
        .option('--structure <structure>', 'Structure key')
        .option('--file <file>', 'Structure JSON file; autodetects by structure key if omitted')
        .option('--create-missing', 'Create the structure when it does not exist')
        .option('--skip-update', 'Skip the structure update after validation')
        .option('--migration-plan <file>', 'Migration plan JSON used to preserve data during the import')
        .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
        .option('--migration-dry-run', 'Do not persist structured content migration changes')
        .option('--cleanup-migration', 'Blank the source fields after mapping them')
        .option('--allow-breaking-change', 'Allow field removals without a migration plan'),
    ),
    run: async (context, options) =>
      runLiferayResourceImportStructure(context.config, {
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
    render: {text: formatLiferayResourceImportStructure},
  });

  registerResourceWorkflow(resource, {
    name: 'import-template',
    description: 'Import or validate a local journal template FTL against the portal',
    configure: (command) =>
      o.checkOnly()(
        command
          .option('--template <template>', 'Template key, ERC, numeric id, or visible name')
          .option('--site <site>', 'Site friendly URL or numeric ID')
          .option('--file <file>', 'Template FTL file; infers --site from the site folder when omitted')
          .option('--structure <structure>', 'Structure key to use when creating a missing template')
          .option('--create-missing', 'Create the template when it does not exist'),
      ),
    run: async (context, options) =>
      runLiferayResourceImportTemplate(context.config, {
        site: options.site,
        key: requireResourceValue(options.template as string | undefined, 'import-template requires --template'),
        file: options.file,
        structureKey: options.structure as string | undefined,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
      }),
    render: {text: formatLiferayResourceImportTemplate},
  });

  registerResourceWorkflow(resource, {
    name: 'import-adt',
    description: 'Import or validate a local ADT FTL against the portal',
    configure: configure(o.site(), o.checkOnly(), (cmd) =>
      cmd
        .option('--adt <adt>', 'ADT key or visible name; inferred from --file when omitted')
        .option('--widget-type <widgetType>', 'ADT widget type; inferred from --file when omitted')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        )
        .option('--file <file>', 'ADT FTL file; recommended entrypoint')
        .option('--create-missing', 'Create the ADT when it does not exist'),
    ),
    run: async (context, options) =>
      runLiferayResourceImportAdt(context.config, {
        site: options.site,
        key: Array.isArray(options.adt) ? options.adt[0] : options.adt,
        widgetType: options.widgetType,
        className: options.className,
        file: options.file,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
      }),
    render: {text: formatLiferayResourceImportAdt},
  });

  registerResourceWorkflow(resource, {
    name: 'import-fragment',
    description: 'Import one local fragment into the portal using the fragments project layout',
    configure: (command) =>
      o.site()(
        command
          .requiredOption('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import')
          .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
          .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects'),
      ),
    run: async (context, options) =>
      runLiferayResourceImportFragments(context.config, {
        site: options.site,
        groupId: options.siteId,
        dir: options.dir,
        fragment: options.fragment,
      }),
    render: {
      text: formatLiferayResourceImportFragments,
      exitCode: getLiferayResourceImportFragmentsExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'import-fragments',
    description: 'Import local fragments into the portal using the fragments project layout',
    configure: configure(
      o.site(),
      o.allSites('Import fragments for every local site project found under the configured base'),
      (cmd) =>
        cmd
          .option('--site-id <siteId>', 'Target Liferay site groupId; overrides --site')
          .option('--dir <dir>', 'Fragments project directory, or parent directory for per-site projects')
          .option('--fragment <fragment>', 'Single fragment slug, name or collection/fragments/slug to import')
          .option(
            '--transport <transport>',
            'Import transport: auto, jsonws, deploy-zip',
            parseFragmentImportTransport,
            'auto',
          ),
    ),
    run: async (context, options) =>
      runLiferayResourceImportFragments(context.config, {
        site: options.site,
        groupId: options.siteId,
        allSites: Boolean(options.allSites),
        dir: options.dir,
        fragment: options.fragment,
        transport: options.transport,
      }),
    render: {
      text: formatLiferayResourceImportFragments,
      exitCode: getLiferayResourceImportFragmentsExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'import-structures',
    description: 'Import local journal structures from the configured resource layout',
    configure: configure(
      o.site(),
      o.allSites('Import structures for every local site directory found'),
      o.checkOnly(),
      o.continueOnError('structure'),
      (cmd) =>
        cmd
          .option('--dir <dir>', 'Source base directory; defaults to paths.structures')
          .option(
            '--structure <key>',
            'Structure key/ERC/file basename to import; repeatable',
            collectRepeatableOption,
            [],
          )
          .option('--apply', 'Import every local structure for the resolved site')
          .option('--create-missing', 'Create structures that do not exist')
          .option('--skip-update', 'Skip structure update after validation')
          .option('--migration-plan <file>', 'Migration plan JSON applied to every imported structure')
          .option('--migration-phase <phase>', 'Migration phase: pre, post or both')
          .option('--migration-dry-run', 'Do not persist structured content migration changes')
          .option('--cleanup-migration', 'Blank source fields after mapping them')
          .option('--allow-breaking-change', 'Allow field removals without a migration plan'),
    ),
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
    render: {text: formatLiferayResourceImportResult, exitCode: getLiferayResourceImportExitCode},
  });

  registerResourceWorkflow(resource, {
    name: 'import-templates',
    description: 'Import local journal templates from the configured resource layout',
    configure: configure(
      o.site(),
      o.allSites('Import templates for every local site directory found'),
      o.checkOnly(),
      o.continueOnError('template'),
      (cmd) =>
        cmd
          .showHelpAfterError(
            '(use --template <key> one or more times, --apply for the resolved site, or --all-sites for every site)',
          )
          .option('--dir <dir>', 'Source base directory; defaults to paths.templates')
          .option('--template <key>', 'Template key/ERC/name to import; repeatable', collectRepeatableOption, [])
          .option('--apply', 'Import every local template for the resolved site')
          .option('--create-missing', 'Create templates that do not exist')
          .option('--structure <structure>', 'Structure key to use when creating missing templates'),
    ),
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
    render: {text: formatLiferayResourceImportResult, exitCode: getLiferayResourceImportExitCode},
  });

  registerResourceWorkflow(resource, {
    name: 'import-adts',
    description: 'Import local ADTs from the configured resource layout',
    configure: configure(
      o.site(),
      o.allSites('Import ADTs for every local site directory found'),
      o.checkOnly(),
      o.continueOnError('ADT'),
      (cmd) =>
        cmd
          .option('--dir <dir>', 'Source base directory; defaults to paths.adts')
          .option('--adt <key>', 'ADT key/file basename to import; repeatable', collectRepeatableOption, [])
          .option('--apply', 'Import every local ADT for the resolved site')
          .option('--widget-type <widgetType>', 'Widget type filter')
          .option(
            '--class-name <className>',
            'Explicit Java class name filter when the widget type is not in the built-in map',
          )
          .option('--create-missing', 'Create ADTs that do not exist'),
    ),
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
    render: {text: formatLiferayResourceImportResult, exitCode: getLiferayResourceImportExitCode},
  });

  registerResourceWorkflow(resource, {
    name: 'import-object',
    description: 'Import or validate a local Liferay Object Definition JSON (fields, relationships) against the portal',
    configure: configure(o.checkOnly(), (cmd) =>
      cmd
        .option('--object <object>', 'Object definition ERC; resolves paths.objects/<erc>.json when --file is omitted')
        .option('--file <file>', 'Object definition JSON file; its externalReferenceCode is the import key')
        .option('--create-missing', 'Create the object definition (and publish it) when it does not exist')
        .option('--allow-breaking-change', 'Allow deleting remote custom fields that are missing from the file'),
    ),
    run: async (context, options) => {
      if (!options.object && !options.file) {
        requireResourceValue(undefined, 'import-object requires --object or --file');
      }
      return runLiferayResourceImportObject(context.config, {
        key: options.object,
        file: options.file,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
        allowBreakingChange: Boolean(options.allowBreakingChange),
      });
    },
    render: {text: formatLiferayResourceImportObject},
  });

  registerResourceWorkflow(resource, {
    name: 'import-picklist',
    description: 'Import or validate a local Liferay picklist JSON (entries keyed by key) against the portal',
    configure: configure(o.checkOnly(), (cmd) =>
      cmd
        .option(
          '--picklist <picklist>',
          'Picklist ERC; resolves paths.objects/picklists/<erc>.json when --file is omitted',
        )
        .option('--file <file>', 'Picklist JSON file; its externalReferenceCode is the import key')
        .option('--create-missing', 'Create the picklist when it does not exist')
        .option('--allow-breaking-change', 'Allow deleting remote entries that are missing from the file'),
    ),
    run: async (context, options) => {
      if (!options.picklist && !options.file) {
        requireResourceValue(undefined, 'import-picklist requires --picklist or --file');
      }
      return runLiferayResourceImportPicklist(context.config, {
        key: options.picklist,
        file: options.file,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
        allowBreakingChange: Boolean(options.allowBreakingChange),
      });
    },
    render: {text: formatLiferayResourceImportPicklist},
  });

  registerResourceWorkflow(resource, {
    name: 'apply-site-initializer',
    description: 'Create a site from a site initializer by site ERC and read back its pages, menus and display pages',
    configure: configure(o.checkOnly(), (cmd) =>
      cmd
        .requiredOption('--source <source>', 'Client extension name, client extension dir, or site-initializer dir')
        .option('--site-erc <erc>', 'Target site ERC; defaults to siteExternalReferenceCode in client-extension.yaml')
        .option('--site-name <name>', 'Site name; defaults to siteName in client-extension.yaml')
        .option('--friendly-url-path <path>', 'Site friendly URL, e.g. /facultat-x')
        .option(
          '--recreate',
          'Delete the existing site and its content, then recreate it (site initializers are create-only)',
        ),
    ),
    run: async (context, options) =>
      runApplySiteInitializer(context.config, {
        source: requireResourceValue(options.source, 'apply-site-initializer requires --source'),
        siteErc: options.siteErc,
        siteName: options.siteName,
        friendlyUrlPath: options.friendlyUrlPath,
        recreate: Boolean(options.recreate),
        checkOnly: Boolean(options.checkOnly),
      }),
    render: {text: formatApplySiteInitializer},
  });

  registerResourceWorkflow(resource, {
    name: 'import-redirects',
    description: 'Import or validate a redirect map (JSON or CSV) for one site, keyed by source URL, with read-back',
    configure: configure(o.checkOnly(), (cmd) =>
      cmd
        .requiredOption('--site <site>', 'Site friendly URL or numeric ID')
        .requiredOption(
          '--file <file>',
          'JSON [{sourceURL, destinationURL, permanent?}] or CSV source,destination[,permanent]',
        )
        .option('--probe', 'After importing, request every source URL and expect 301/302 to its destination'),
    ),
    run: async (context, options) =>
      runLiferayRedirectsImport(context.config, {
        site: requireResourceValue(options.site, 'import-redirects requires --site'),
        file: requireResourceValue(options.file, 'import-redirects requires --file'),
        checkOnly: Boolean(options.checkOnly),
        probe: Boolean(options.probe),
      }),
    render: {text: formatLiferayRedirectsImport},
  });

  registerResourceWorkflow(resource, {
    name: 'import-style-book',
    description: 'Import or validate a local Style Book JSON (frontend tokens) by ERC, with read-back',
    configure: configure(o.checkOnly(), (cmd) =>
      cmd
        .option('--style-book <erc>', 'Style book ERC; resolves liferay/resources/style-books/<site>/<erc>.json')
        .option('--file <file>', 'Style book JSON file')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--create-missing', 'Create the style book when it does not exist'),
    ),
    run: async (context, options) =>
      runLiferayResourceImportStyleBook(context.config, {
        site: options.site,
        key: options.styleBook,
        file: options.file,
        checkOnly: Boolean(options.checkOnly),
        createMissing: Boolean(options.createMissing),
      }),
    render: {text: formatLiferayStyleBookImport},
  });
}
