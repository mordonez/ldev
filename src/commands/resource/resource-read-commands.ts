import type {Command} from 'commander';

import {o, registerResourceWorkflow, requireResourceValue, type ResourceCommandOptionBag} from './resource.command.js';
import {
  formatLiferayResourceAdt,
  runLiferayResourceGetAdt,
} from '../../features/liferay/resource/liferay-resource-get-adt.js';
import {
  formatLiferayResourceStructure,
  runLiferayResourceGetStructure,
  type LiferayResourceStructureResult,
} from '../../features/liferay/resource/liferay-resource-get-structure.js';
import {runLiferayResourceExportStructure} from '../../features/liferay/resource/liferay-resource-export-structure.js';
import {
  formatLiferayResourceTemplate,
  runLiferayResourceGetTemplate,
  type LiferayResourceTemplateResult,
} from '../../features/liferay/resource/liferay-resource-get-template.js';
import {runLiferayResourceExportTemplate} from '../../features/liferay/resource/liferay-resource-export-template.js';
import {
  formatLiferayResourceAdts,
  runLiferayResourceListAdts,
} from '../../features/liferay/resource/liferay-resource-list-adts.js';
import {
  formatLiferayResourceFragments,
  runLiferayResourceListFragments,
} from '../../features/liferay/resource/liferay-resource-list-fragments.js';

type StructureReadResult = LiferayResourceStructureResult | {outputPath: string};
type TemplateReadResult = LiferayResourceTemplateResult | {outputPath: string};

function isOutputPath(result: unknown): result is {outputPath: string} {
  return typeof result === 'object' && result !== null && 'outputPath' in result;
}

export function registerResourceReadCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'structure',
    description: 'Read one journal structure by key or numeric id; use --out to write JSON to a file',
    configure: (command) =>
      command
        .option('--structure <structure>', 'Structure key or numeric id')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--out [file]', 'Write structure JSON to a file; omit path to use the default structures layout'),
    run: async (context, options): Promise<StructureReadResult> => {
      const structure = requireResourceValue(options.structure as string | undefined, 'structure requires --structure');
      const outFile = options.out;
      if (outFile !== undefined) {
        return runLiferayResourceExportStructure(context.config, {
          site: options.site,
          key: structure,
          output: typeof outFile === 'string' ? outFile : undefined,
          pretty: true,
        });
      }
      return runLiferayResourceGetStructure(context.config, {
        site: options.site,
        key: structure,
      });
    },
    render: {
      text: (result) => (isOutputPath(result) ? result.outputPath : formatLiferayResourceStructure(result)),
    },
  });

  registerResourceWorkflow(resource, {
    name: 'template',
    description: 'Read one journal template by key, ERC, id, or visible name; use --out to write FTL to a file',
    configure: (command) =>
      command
        .option('--template <template>', 'Template key, ERC, numeric id, or visible name')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--out [file]', 'Write template FTL to a file; omit path to use the default templates layout'),
    run: async (context, options): Promise<TemplateReadResult> => {
      const id = requireResourceValue(options.template as string | undefined, 'template requires --template');
      const outFile = options.out;
      if (outFile !== undefined) {
        return runLiferayResourceExportTemplate(context.config, {
          site: options.site,
          id,
          output: typeof outFile === 'string' ? outFile : undefined,
        });
      }
      return runLiferayResourceGetTemplate(context.config, {
        site: options.site,
        id,
      });
    },
    render: {
      text: (result) => (isOutputPath(result) ? result.outputPath : formatLiferayResourceTemplate(result)),
    },
  });

  registerResourceWorkflow(resource, {
    name: 'adt',
    description: 'Inspect one ADT in detail',
    configure: (command) =>
      command
        .option('--site <site>', 'Site friendly URL or numeric ID; omit to search accessible sites')
        .option('--display-style <displayStyle>', 'Runtime display style like ddmTemplate_19690804')
        .option('--adt <adt>', 'ADT key or visible name')
        .option('--id <id>', 'Numeric template id')
        .option('--name <name>', 'ADT visible name')
        .option('--widget-type <widgetType>', 'Optional widget type filter')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        ),
    run: async (context, options: ResourceCommandOptionBag) =>
      runLiferayResourceGetAdt(context.config, {
        site: options.site,
        displayStyle: options.displayStyle,
        id: options.id,
        key: Array.isArray(options.adt) ? options.adt[0] : options.adt,
        name: options.name,
        widgetType: options.widgetType,
        className: options.className,
      }),
    render: {text: formatLiferayResourceAdt},
  });

  registerResourceWorkflow(resource, {
    name: 'adts',
    description: 'List application display templates for a site',
    configure: (command) =>
      o.site()(
        command
          .option('--widget-type <widgetType>', 'Optional widget type filter')
          .option(
            '--class-name <className>',
            'Explicit Java class name to query when the widget type is not in the built-in map',
          )
          .option('--include-script', 'Include template script in JSON output'),
      ),
    run: async (context, options) =>
      runLiferayResourceListAdts(context.config, {
        site: options.site,
        widgetType: options.widgetType,
        className: options.className,
        includeScript: Boolean(options.includeScript),
      }),
    render: {text: formatLiferayResourceAdts},
  });

  registerResourceWorkflow(resource, {
    name: 'fragments',
    description: 'List fragment collections and fragment entries for a site',
    configure: o.site(),
    run: async (context, options) =>
      runLiferayResourceListFragments(context.config, {
        site: options.site,
      }),
    render: {text: formatLiferayResourceFragments},
  });
}
