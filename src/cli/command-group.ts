import type {Command} from 'commander';

/**
 * Internal command-group contract for wiring built-in namespaces.
 *
 * This is intentionally an internal implementation detail.
 * It groups built-in commands for registration and root-help layout.
 *
 * It should not be treated as a stable extension API.
 */
export type CommandGroup = {
  /** Unique internal group identifier */
  name: string;

  /** Internal version marker */
  version: string;

  /** Optional help group label for commands registered by this group */
  group?: string;

  /** Register commands on the root Commander program */
  register: (program: Command) => void;
};
