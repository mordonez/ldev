import type {Command} from 'commander';

import {buildResourceCommand} from './resource-command-builder.js';

export function createResourceCommand(): Command {
  return buildResourceCommand({
    description: 'Export, import and migrate content resources',
    helpText: `
Use this namespace for file-based content workflows for structures, templates, ADTs or fragments.
It is intended for more specialized content workflows rather than first-run onboarding.

Read:
  structure, template, adts, adt-types, fragments, resolve-adt

Export:
  export-structure, export-template, export-structures, export-templates, export-adt, export-adts, export-fragment, export-fragments

Import:
  import-structure, import-template, import-adt, import-fragment, import-fragments, import-structures, import-templates, import-adts

Migration:
  migration-init, migration-run, migration-pipeline
`,
  });
}
