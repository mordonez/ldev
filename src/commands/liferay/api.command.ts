import {Command} from 'commander';

import {addOutputFormatOption, createFormattedArgumentAction} from '../../cli/command-helpers.js';
import {
  formatLiferayApiDiscover,
  runLiferayApiDiscover,
  type ApiDiscoverResult,
} from '../../features/liferay/liferay-api-discover.js';

type ApiDiscoverCommandOptions = {
  path?: string;
  method?: string;
  schema?: string;
  example?: string;
};

export function createApiCommands(parent: Command): void {
  const api = new Command('api')
    .helpGroup('Discovery:')
    .description('Headless REST API discovery: apps, endpoints, schemas and parameters');

  addOutputFormatOption(
    api
      .command('discover')
      .description('Resolve the OpenAPI spec of a Headless app and list endpoints, schemas and parameters')
      .argument('[app]', 'Headless app name (e.g. headless-delivery); omit to list available apps')
      .option('--path <substring>', 'Only show endpoints whose path contains this substring')
      .option('--method <method>', 'Only show endpoints with this HTTP method (also selects the --example method)')
      .option('--schema <name>', 'Show full property details for one schema')
      .option('--example <path>', 'Emit a working curl + fetch example for the endpoint matching this path')
      .addHelpText(
        'after',
        `
Examples:
  ldev portal api discover
  ldev portal api discover headless-delivery
  ldev portal api discover headless-delivery --path structured-contents
  ldev portal api discover headless-delivery --schema StructuredContent
  ldev portal api discover headless-delivery --example /sites/{siteId}/structured-contents
  ldev portal api discover headless-admin-user --json

Notes:
  - Without an app name, lists every Headless app registered at /o/openapi.
  - The spec is resolved from the /o/openapi catalog first, then by the /o/<app>/v1.0/openapi.json pattern.
  - Endpoint capability tags show which of page/pageSize, filter, sort and search each endpoint accepts.
  - Examples authenticate with a Bearer token; fetch one with: ldev portal auth token --raw
`,
      ),
  ).action(
    createFormattedArgumentAction<string | undefined, ApiDiscoverCommandOptions, ApiDiscoverResult>(
      async (context, app, options) =>
        runLiferayApiDiscover(context.config, {
          app,
          path: options.path,
          method: options.method,
          schema: options.schema,
          example: options.example,
        }),
      {text: formatLiferayApiDiscover},
    ),
  );

  parent.addCommand(api);
}
