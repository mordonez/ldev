---
title: Configuration Reference
---

# Configuration Reference

ldev resolves configuration from three sources, in priority order:

1. **Shell environment variables** — highest priority, override everything
2. **`docker/.env`** — Docker Compose env file, per-project
3. **`.liferay-cli.yml`** — ldev profile at the repo root, version-controlled defaults

---

## Project detection

ldev walks up from the current directory looking for a folder that has both `docker/docker-compose.yml` and a `liferay/` directory. That folder becomes the **repo root**.

Platform note:

- Btrfs-related configuration keys are Linux-only
- On macOS and Windows, keep `BTRFS_BASE` / `BTRFS_ENVS` unset
- See the [Support Matrix](/support-matrix) for the supported host/platform combinations

Override the working directory without `cd`:

```bash
REPO_ROOT=/path/to/my-project ldev status
```

---

## `docker/.env`

Created by `ldev setup` from `docker/.env.example`. Not committed to git.

| Key                                | Default                      | Description                                                                                     |
| ---------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `BIND_IP`                          | `localhost`                  | IP address Docker binds to. Set to a fixed LAN/VPN IP to access from other devices.             |
| `LIFERAY_HTTP_PORT`                | `8080`                       | HTTP port exposed by the Liferay container.                                                     |
| `COMPOSE_PROJECT_NAME`             | `liferay`                    | Docker Compose project name. Prefix for container and volume names.                             |
| `ENV_DATA_ROOT`                    | `./data/default`             | Path (absolute or relative to `docker/`) where runtime data volumes are stored.                 |
| `LIFERAY_CLI_URL`                  | derived from `BIND_IP`+port  | Portal URL used by ldev for API calls. Set explicitly if the URL differs from the bind address. |
| `LIFERAY_CLI_OAUTH2_CLIENT_ID`     | —                            | OAuth2 client ID created in the portal. Required for `portal` and `resource` commands.          |
| `LIFERAY_CLI_OAUTH2_CLIENT_SECRET` | —                            | OAuth2 client secret.                                                                           |
| `LIFERAY_CLI_OAUTH2_SCOPE_ALIASES` | —                            | Override the requested OAuth2 scope aliases for portal and MCP access tokens.                   |
| `LIFERAY_CLI_HTTP_TIMEOUT_SECONDS` | `30`                         | Timeout for HTTP calls to the portal.                                                           |
| `LCP_PROJECT`                      | `my-lcp-project`             | Liferay Cloud project ID. Used by `db download`, `db sync`, `db files-download`.                |
| `LCP_ENVIRONMENT`                  | `prd`                        | Liferay Cloud environment. Used by `db` commands.                                               |
| `DOCLIB_VOLUME_NAME`               | `<project>-doclib`           | Docker volume name for the Document Library.                                                    |
| `DOCLIB_PATH`                      | `<data-root>/liferay-doclib` | Host path to the Document Library directory. Set by `db files-detect`.                          |
| `BTRFS_ROOT`                       | —                            | Linux only. Root directory for the Btrfs-backed worktree data layout.                           |
| `BTRFS_BASE`                       | —                            | Linux only. Path to the BTRFS subvolume used as a base snapshot for worktrees.                  |
| `BTRFS_ENVS`                       | —                            | Linux only. Path to the BTRFS worktree environments root.                                       |
| `USE_BTRFS_SNAPSHOTS`              | —                            | Linux only. Enables snapshot-based worktree state cloning.                                      |

---

## `.liferay-cli.yml`

Optional YAML file at the repo root. Version-controlled, safe to commit. Useful for team defaults.

```yaml
paths:
  structures: liferay/resources/journal/structures
  templates: liferay/resources/journal/templates
  adts: liferay/resources/templates/application_display
  fragments: liferay/fragments
  migrations: liferay/resources/journal/migrations
```

| Key                             | Default                                           | Description                           |
| ------------------------------- | ------------------------------------------------- | ------------------------------------- |
| `paths.structures`              | `liferay/resources/journal/structures`            | Local path for exported structures.   |
| `paths.templates`               | `liferay/resources/journal/templates`             | Local path for exported templates.    |
| `paths.adts`                    | `liferay/resources/templates/application_display` | Local path for exported ADTs.         |
| `paths.fragments`               | `liferay/fragments`                               | Local path for exported fragments.    |
| `paths.migrations`              | `liferay/resources/journal/migrations`            | Local path for migration descriptors. |

---

## Shell environment variables

Set in your shell profile (`~/.zshrc`, `~/.bashrc`) for machine-wide defaults.

| Variable                           | Description                                                              |
| ---------------------------------- | ------------------------------------------------------------------------ |
| `LDEV_ACTIVATION_KEY_FILE`         | Path to a DXP activation key. Used by `ldev start` automatically if set. |
| `REPO_ROOT`                        | Override the working directory. Useful in scripts or CI.                 |
| `LIFERAY_CLI_URL`                  | Portal URL. Overrides `docker/.env` and `.liferay-cli.yml`.              |
| `LIFERAY_CLI_OAUTH2_CLIENT_ID`     | OAuth2 client ID. Overrides `.liferay-cli.local.yml`, `docker/.env` (legacy), and `.liferay-cli.yml`.        |
| `LIFERAY_CLI_OAUTH2_CLIENT_SECRET` | OAuth2 client secret. Overrides `.liferay-cli.local.yml`, `docker/.env` (legacy), and `.liferay-cli.yml`.    |
| `LIFERAY_CLI_OAUTH2_SCOPE_ALIASES` | OAuth2 scope aliases. Overrides `.liferay-cli.local.yml`, `docker/.env` (legacy), and `.liferay-cli.yml`.    |
| `LIFERAY_CLI_HTTP_TIMEOUT_SECONDS` | HTTP timeout. Overrides lower-priority sources.                          |
| `LCP_PROJECT`                      | Liferay Cloud project ID. Overrides `docker/.env`.                       |
| `LCP_ENVIRONMENT`                  | Liferay Cloud environment. Overrides `docker/.env`.                      |
| `BIND_IP`                          | Bind IP. Overrides `docker/.env`.                                        |

---

## OAuth2 setup

`portal` and `resource` commands require an OAuth2 application in the running Liferay instance:

1. Start the local environment with `ldev start`
2. Create or refresh the ldev OAuth2 apps with `ldev oauth install --write-env`
3. `--write-env` stores the generated credentials in `.liferay-cli.local.yml` (gitignored by the ldev project template). You can still override them from your shell environment or secret manager:

```bash
LIFERAY_CLI_OAUTH2_CLIENT_ID=id-abc123
LIFERAY_CLI_OAUTH2_CLIENT_SECRET=<your-client-secret>
```

If you need to target a specific company or user, pass `--company-id` and `--user-id` to `ldev oauth install`.

`ldev oauth install` creates both:

- a read/write app for commands that change portal state
- a read-only app for inventory/export and safer inspection workflows

Most users do not need to manage OAuth2 scope aliases manually. The bundled installer creates the app with the scopes that `ldev` needs by default. Advanced runtime overrides can still be handled through environment configuration when necessary.

See [OAuth2 Scopes](/oauth-scopes) for:

- the default scope profile installed by `ldev`
- why each default scope exists
- optional scope profiles for content authoring, site admin, and advanced object work

`ldev` resolves OAuth2 credentials from shell env first, then `.liferay-cli.local.yml`, and finally `docker/.env` as a legacy fallback. Avoid storing auth credentials in `.liferay-cli.yml`.

Verify with:

```bash
ldev portal check
```

---

## Data directory layout

`ENV_DATA_ROOT` (default: `docker/data/default/`) contains all runtime volumes:

```
data/default/
  liferay-data/          # Liferay home data
  liferay-osgi-state/    # OSGi bundle cache
  liferay-deploy-cache/  # Deploy artifacts cache
  liferay-doclib/        # Document Library (if not using DOCLIB_PATH)
  elasticsearch-data/    # Elasticsearch indices
  postgres-data/         # PostgreSQL database files
  patching/              # Patching tool state
  dumps/                 # Thread/heap dumps
```

[Back to Home](/)
