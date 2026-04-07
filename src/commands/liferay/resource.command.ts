import type {Command} from 'commander';

import {buildResourceCommand} from '../resource/resource-command-builder.js';

export function createResourceCommands(parent: Command): void {
  parent.addCommand(
    buildResourceCommand({
      description: 'Read, export and import structured Liferay resources',
      helpGroup: 'Resource workflows:',
      helpText: `
Use this namespace when you need stable file-based workflows for structures, templates, ADTs or fragments.

Read:
  structure, template, adts, adt-types, fragments, resolve-adt

Export:
  export-structure, export-template, export-structures, export-templates, export-adt, export-adts, export-fragment, export-fragments

Import:
  import-structure, import-template, import-adt, import-fragment, import-fragments, import-structures, import-templates, import-adts

Migration:
  migration-init, migration-run, migration-pipeline
`,
    }),
  );
}
