---
layout: default
title: Plugin API
---

# Plugin API

`ldev` uses an internal plugin architecture. All built-in commands are registered through the same `LdevPlugin` interface that external plugins will use.

## LdevPlugin Interface

```typescript
import type {Command} from 'commander';

type LdevPlugin = {
  /** Unique plugin identifier */
  name: string;

  /** SemVer version string */
  version: string;

  /** Optional help group label for commands */
  group?: string;

  /** Register commands on the root Commander program */
  register: (program: Command) => void;
};
```

## Creating a Plugin

```typescript
import type {LdevPlugin} from 'ldev';
import {Command} from 'commander';

export const myPlugin: LdevPlugin = {
  name: 'my-plugin',
  version: '1.0.0',
  group: 'Custom commands:',
  register(program) {
    const cmd = new Command('my-command')
      .description('Does something useful')
      .option('--json', 'Output as JSON')
      .action((options) => {
        console.log(JSON.stringify({ok: true, message: 'Hello from plugin'}));
      });

    program.addCommand(cmd.helpGroup(this.group!));
  },
};
```

## Using a Custom CLI

You can compose a custom CLI with any combination of plugins:

```typescript
import {createCli} from 'ldev';
import {myPlugin} from './my-plugin.js';

// Create CLI with only your plugins
const cli = createCli([myPlugin]);
await cli.parseAsync(process.argv);
```

Or extend the default CLI:

```typescript
import {createCli, BUILTIN_PLUGINS} from 'ldev';
import {myPlugin} from './my-plugin.js';

const cli = createCli([...BUILTIN_PLUGINS, myPlugin]);
await cli.parseAsync(process.argv);
```

## Built-in Plugins

All built-in commands are organized into five plugins:

| Plugin | Group | Commands |
|---|---|---|
| `core` | Core commands | doctor, setup, start, stop, status, logs, shell, context |
| `workspace` | Workspace commands | project, worktree |
| `runtime` | Runtime commands | env, db, deploy, osgi |
| `liferay` | Liferay commands | liferay (inventory, resource, page-layout, auth) |
| `ai` | Internal commands | ai (hidden) |

## Plugin Discovery (Planned)

External plugin discovery is not yet implemented. When demand arises, plugins will be discoverable via:

1. `package.json` `ldev.plugins` field
2. `.liferay-cli.yml` configuration
3. Convention-based package names (`ldev-plugin-*`)

For now, custom plugins must be composed programmatically as shown above.

[Back to Home](./)
