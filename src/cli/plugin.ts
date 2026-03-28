import type {Command} from 'commander';

/**
 * Plugin interface for extending the ldev CLI.
 *
 * Built-in command modules already conform to this interface.
 * External plugins will follow the same contract when the plugin
 * discovery mechanism is added.
 *
 * ## Lifecycle
 *
 * 1. Plugin is discovered (built-in: static import; future: package.json, config file)
 * 2. `register()` is called with the root Commander program
 * 3. Plugin adds its commands/subcommands to the program
 *
 * ## Example
 *
 * ```typescript
 * import type {LdevPlugin} from 'ldev';
 *
 * export const myPlugin: LdevPlugin = {
 *   name: 'my-plugin',
 *   version: '1.0.0',
 *   register(program) {
 *     program.addCommand(
 *       new Command('my-command')
 *         .description('Does something useful')
 *         .action(() => { ... })
 *     );
 *   },
 * };
 * ```
 */
export type LdevPlugin = {
  /** Unique plugin identifier (e.g. 'core', 'liferay', 'my-custom-plugin') */
  name: string;

  /** SemVer version string */
  version: string;

  /** Optional help group label for commands registered by this plugin */
  group?: string;

  /** Register commands on the root Commander program */
  register: (program: Command) => void;
};
