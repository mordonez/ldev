import type {Command} from 'commander';

import {registerResourceWorkflow, requireResourceValue, type ResourceCommandOptionBag} from './resource-workflow.js';
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

export function registerResourceReadCommands(resource: Command): void {
  registerResourceWorkflow(resource, {
    name: 'structure',
    description: 'Read one journal structure by key or numeric id',
    configure: (command) =>
      command
        .option('--structure <structure>', 'Structure key or numeric id')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    run: async (context, options) => {
      const structure = requireResourceValue(options.structure as string | undefined, 'structure requires --structure');
      return runLiferayResourceGetStructure(context.config, {
        site: options.site,
        key: structure,
      });
    },
    render: {text: formatLiferayResourceStructure},
  });

  registerResourceWorkflow(resource, {
    name: 'template',
    description: 'Read one journal template by key, ERC, id, or visible name',
    configure: (command) =>
      command
        .option('--template <template>', 'Template key, ERC, numeric id, or visible name')
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    run: async (context, options) =>
      runLiferayResourceGetTemplate(context.config, {
        site: options.site,
        id: requireResourceValue(options.template as string | undefined, 'template requires --template'),
      }),
    render: {text: formatLiferayResourceTemplate},
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
      command
        .option('--site <site>', 'Site friendly URL or numeric ID', '/global')
        .option('--widget-type <widgetType>', 'Optional widget type filter')
        .option(
          '--class-name <className>',
          'Explicit Java class name to query when the widget type is not in the built-in map',
        )
        .option('--include-script', 'Include template script in JSON output'),
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
    configure: (command) => command.option('--site <site>', 'Site friendly URL or numeric ID', '/global'),
    run: async (context, options) =>
      runLiferayResourceListFragments(context.config, {
        site: options.site,
      }),
    render: {text: formatLiferayResourceFragments},
  });
}
