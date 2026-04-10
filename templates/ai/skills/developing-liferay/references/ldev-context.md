# `ldev context --json` and `ldev status --json` Field Reference

Use this reference to understand the actual machine-readable contract exposed by
`ldev`. Keep it aligned with the real CLI output; do not infer extra fields.

## `ldev context --json`

Returns the resolved repo, runtime, Liferay, AI, and command-capability
snapshot for the current working directory.

### Identity and repo

| Field | Type | Description |
|---|---|---|
| `contractVersion` | string | Current context contract version. |
| `cwd` | string | Absolute working directory where the command ran. |
| `projectType` | string | `ldev-native`, `blade-workspace`, or `unknown`. |
| `repo.root` | string \| null | Detected repository root. |
| `repo.inRepo` | boolean | Whether `ldev` detected a valid repo. |
| `repo.isWorktree` | boolean | Whether the cwd is inside a git worktree. |
| `repo.branch` | string \| null | Current git branch when in a repo. |
| `repo.gitCommonDir` | string \| null | Git common dir when in a repo. |

### Files and paths

| Field | Type | Description |
|---|---|---|
| `files.dockerDir` | string \| null | Docker directory used by the runtime, when detected. |
| `files.liferayDir` | string \| null | Liferay source directory, when detected. |
| `files.dockerEnv` | string \| null | Effective Docker `.env` file path. |
| `files.liferayProfile` | string \| null | Effective Liferay profile file path. |
| `paths.structures` | string \| null | Standard Journal structures path. |
| `paths.templates` | string \| null | Standard Journal templates path. |
| `paths.adts` | string \| null | Standard ADT path. |
| `paths.fragments` | string \| null | Standard fragments path. |
| `paths.migrations` | string \| null | Standard Journal migrations path. |

These `paths.*` values come from the resolved `ldev` project contract. They are
the right defaults to use for `ldev resource ...` workflows, but they do not
guarantee that the directory already exists or contains files.

### Runtime env

| Field | Type | Description |
|---|---|---|
| `env.composeProjectName` | string \| null | Docker Compose project name when available. |
| `env.dataRoot` | string \| null | Runtime data root. Useful for env/worktree maintenance. |
| `env.bindIp` | string \| null | Bind IP for the local runtime. |
| `env.httpPort` | string \| null | Effective HTTP port. |
| `env.portalUrl` | string \| null | Effective local portal URL. Always use this instead of hardcoding the host or port. |

### Liferay config

| Field | Type | Description |
|---|---|---|
| `liferay.url` | string | Base URL from resolved config. Often matches `env.portalUrl`. |
| `liferay.oauth2Configured` | boolean | Whether OAuth2 client credentials are configured for `ldev`. |
| `liferay.oauth2ClientIdConfigured` | boolean | Whether a client ID is configured. |
| `liferay.oauth2ClientSecretConfigured` | boolean | Whether a client secret is configured. |
| `liferay.scopeAliases` | string[] | Scope aliases currently configured for `ldev`. |
| `liferay.scopeAliasesCount` | number | Convenience count of configured scope aliases. |
| `liferay.timeoutSeconds` | number | HTTP timeout used for Liferay API calls. |

### Workspace / AI / commands

| Field | Type | Description |
|---|---|---|
| `workspace.product` | string \| null | Workspace product when `blade-workspace` is detected. |
| `ai.manifestPresent` | boolean | Whether `.ldev/ai/rules-manifest.json` exists. |
| `ai.managedRules` | number | Count of managed AI rules. |
| `ai.modifiedRules` | number | Count of modified managed rules. |
| `ai.staleRuntimeRules` | number | Count of stale runtime rule files. |
| `commands.*.supported` | boolean | Whether the command namespace is currently usable. |
| `commands.*.requires` | string[] | Requirements for that namespace. |
| `commands.*.missing` | string[] | Requirements currently missing. |

Interpretation rule:

- If `commands.portal.supported` is `false`, do not guess portal commands will
  work just because `env.portalUrl` exists.
- If `commands.worktree.supported` is `false`, do not write worktree flows for
  that repo.
- If `liferay.oauth2Configured` is `false`, do not assume Bearer-token flows are
  ready. Use `ldev oauth install --write-env` or fall back to manual checks only.

---

## `ldev status --json`

Returns the live runtime status for the current local environment.

### Top-level fields

| Field | Type | Description |
|---|---|---|
| `repoRoot` | string | Repository root used by the runtime. |
| `dockerDir` | string | Docker directory used for compose commands. |
| `dockerEnvFile` | string | Effective Docker `.env` file. |
| `composeProjectName` | string | Effective Compose project name. |
| `portalUrl` | string | URL checked for portal reachability. |
| `portalReachable` | boolean | Whether `portalUrl` responds successfully. |
| `services` | array | Detailed compose service status entries. |
| `liferay` | object \| null | The `services` entry for the `liferay` service, when present. |

### `services[*]`

| Field | Type | Description |
|---|---|---|
| `service` | string | Compose service name. |
| `state` | string \| null | Docker state such as `running`, `exited`, or `dead`. |
| `health` | string \| null | Health check state such as `healthy` or `unhealthy`; `null` when no health check exists. |
| `containerId` | string \| null | Docker container ID when present. |

### Decision table

| `liferay.state` | `liferay.health` | `portalReachable` | Action |
|---|---|---|---|
| `null`, `exited`, `dead` | — | `false` | Runtime is not up. Start it or inspect container failure. |
| `running` | `unhealthy` | `false` | Check `services` and run `ldev logs diagnose --since 10m --json`. |
| `running` | `healthy` or `null` | `false` | Portal may still be booting; retry briefly, then diagnose if it does not recover. |
| `running` | `healthy` or `null` | `true` | Runtime is ready; proceed with portal and deploy commands. |
