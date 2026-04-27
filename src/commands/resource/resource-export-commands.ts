import type {Command} from 'commander';

import {registerResourceWorkflow, requireResourceValue} from './resource-workflow.js';
import {LiferayErrors} from '../../features/liferay/errors/index.js';
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

export function registerResourceExportCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'export-structure',
    description: 'Export one journal structure JSON to a file or the default structures layout',
    configure: (command) =>
      command
        .option('--structure <structure>', 'Structure key or numeric id')
        .option('--output <file>', 'Destination JSON file; defaults to paths.structures/<site>/<structure>.json')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--pretty', 'Pretty-print the JSON file output', true),
    run: async (context, options) => {
      const structure = requireResourceValue(
        options.structure as string | undefined,
        'export-structure requires --structure',
      );
      return runLiferayResourceExportStructure(context.config, {
        site: options.site,
        key: structure,
        output: options.output,
        pretty: Boolean(options.pretty),
      });
    },
    render: {text: (result) => result.outputPath},
  });

  registerResourceWorkflow(resource, {
    name: 'export-template',
    description: 'Export one journal template FTL to a file or the default templates layout',
    configure: (command) =>
      command
        .option('--template <template>', 'Template key, ERC, numeric id, or visible name')
        .option('--output <file>', 'Destination FTL file; defaults to paths.templates/<site>/<template>.ftl')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    run: async (context, options) =>
      runLiferayResourceExportTemplate(context.config, {
        site: options.site,
        id: requireResourceValue(options.template as string | undefined, 'export-template requires --template'),
        output: options.output,
      }),
    render: {text: (result) => result.outputPath},
  });

  registerResourceWorkflow(resource, {
    name: 'export-structures',
    description: 'Export all journal structures of a site into the local resource layout',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Destination base directory; defaults to paths.structures')
        .option('--all-sites', 'Export structures for every accessible site')
        .option('--check-only', 'Only report diffs against local files without writing them'),
    run: async (context, options) =>
      runLiferayResourceExportStructures(context.config, {
        site: options.site,
        dir: options.dir,
        allSites: Boolean(options.allSites),
        checkOnly: Boolean(options.checkOnly),
      }),
    render: {text: formatLiferayResourceExportStructures},
  });

  registerResourceWorkflow(resource, {
    name: 'export-templates',
    description: 'Export all journal templates of a site into the local resource layout',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Destination base directory; defaults to paths.templates')
        .option('--all-sites', 'Export templates for every accessible site')
        .option('--debug', 'Show which enumeration source was used and how many templates each source returned')
        .option('--continue-on-error', 'Continue exporting other templates if one entry fails'),
    run: async (context, options) =>
      runLiferayResourceExportTemplates(context.config, {
        site: options.site,
        dir: options.dir,
        allSites: Boolean(options.allSites),
        debug: Boolean(options.debug),
        continueOnError: Boolean(options.continueOnError),
      }),
    render: {
      text: formatLiferayResourceExportTemplates,
      exitCode: getLiferayResourceExportTemplatesExitCode,
    },
  });

  registerResourceWorkflow(resource, {
    name: 'export-adt',
    description: 'Export one ADT script to the local resource directory',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Destination directory; defaults to paths.adts/<site>')
        .option('--adt <adt>', 'ADT key or visible name')
        .option('--name <name>', 'ADT visible name')
        .option('--widget-type <widgetType>', 'Widget type label used for known ADTs or local layout')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        )
        .option('--continue-on-error', 'Return success for partial failures'),
    run: async (context, options) => {
      const adt = Array.isArray(options.adt) ? options.adt[0] : options.adt;
      if (!adt && !options.name) {
        throw LiferayErrors.configError('export-adt requires --adt or --name');
      }
      return runLiferayResourceExportAdts(context.config, {
        site: options.site,
        dir: options.dir,
        key: adt,
        name: options.name,
        widgetType: options.widgetType,
        className: options.className,
        continueOnError: Boolean(options.continueOnError),
      });
    },
    render: {text: formatLiferayResourceExportAdts},
  });

  registerResourceWorkflow(resource, {
    name: 'export-adts',
    description: 'Export ADT scripts to the local resource directory',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Destination directory; defaults to paths.adts/<site>')
        .option('--all-sites', 'Export ADTs for every accessible site')
        .option('--adt <adt>', 'Export only one ADT by template key or visible name')
        .option('--name <name>', 'Export only one ADT by visible name')
        .option('--widget-type <widgetType>', 'Widget type label used for known ADTs or local layout')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        )
        .option('--continue-on-error', 'Continue exporting other ADTs if one entry fails'),
    run: async (context, options) =>
      runLiferayResourceExportAdts(context.config, {
        site: options.site,
        dir: options.dir,
        allSites: Boolean(options.allSites),
        key: Array.isArray(options.adt) ? options.adt[0] : options.adt,
        name: options.name,
        widgetType: options.widgetType,
        className: options.className,
        continueOnError: Boolean(options.continueOnError),
      }),
    render: {text: formatLiferayResourceExportAdts},
  });

  registerResourceWorkflow(resource, {
    name: 'export-fragment',
    description: 'Export one fragment into the local fragments project layout',
    configure: (command) =>
      command
        .requiredOption('--fragment <fragment>', 'Fragment key or visible name')
        .option('--collection <collection>', 'Optional fragment collection key or name')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>'),
    run: async (context, options) =>
      runLiferayResourceExportFragments(context.config, {
        site: options.site,
        dir: options.dir,
        collection: options.collection,
        fragment: options.fragment,
      }),
    render: {text: formatLiferayResourceExportFragments},
  });

  registerResourceWorkflow(resource, {
    name: 'export-fragments',
    description: 'Export fragments of a site into the local fragments project layout',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--all-sites', 'Export fragments for every accessible site')
        .option('--dir <dir>', 'Destination project directory; defaults to paths.fragments/sites/<site>')
        .option('--collection <collection>', 'Export only one fragment collection by key or name')
        .option('--fragment <fragment>', 'Export only one fragment by key or name'),
    run: async (context, options) =>
      runLiferayResourceExportFragments(context.config, {
        site: options.site,
        allSites: Boolean(options.allSites),
        dir: options.dir,
        collection: options.collection,
        fragment: options.fragment,
      }),
    render: {text: formatLiferayResourceExportFragments},
  });
}
