import type {Command} from 'commander';

import {buildResourceCommand} from '../resource/resource.command.js';

export function createResourceCommands(parent: Command): void {
  parent.addCommand(
    buildResourceCommand({
      description: 'Read, export and import structured Liferay resources',
      helpGroup: 'Resource workflows:',
      helpText: `
Use this namespace when you need stable file-based workflows for structures, templates, ADTs, fragments, Liferay Objects or picklists.

Read:
  structure, template, adts, adt, fragments, object, picklist

Export:
  export-structure, export-template, export-structures, export-templates, export-adt, export-adts, export-fragment, export-fragments, export-object, export-picklist

Import:
  import-structure, import-template, import-adt, import-fragment, import-fragments, import-structures, import-templates, import-adts, import-object, import-picklist

Migration:
  migration-init, migration-pipeline

Recommended:
  migration-pipeline for normal end-to-end migrations
`,
    }),
  );
}
