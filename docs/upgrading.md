# Upgrading

This guide covers two different upgrade paths:

- upgrading the `ldev` CLI itself
- upgrading scaffolded project files in a repo that already uses `ldev`

These are related, but they are not the same operation.

## 1. Upgrade the CLI

If you installed `ldev` globally:

```bash
npm install -g @mordonezdev/ldev@latest
ldev --version
```

If you prefer `npx`:

```bash
npx @mordonezdev/ldev@latest --version
```

If you need to roll back to a known-good release:

```bash
npm install -g @mordonezdev/ldev@0.1.0
```

or:

```bash
npx @mordonezdev/ldev@0.1.0 --help
```

Before upgrading a team machine image or shared setup, read:

- [Support Matrix](/support-matrix)
- [Support Matrix](/support-matrix)
- [Releasing](/releasing)

## 2. Understand what does not happen automatically

`ldev` does **not** currently provide an automatic project-scaffold migration command.

That means:

- upgrading the CLI does not rewrite your repo automatically
- existing `docker/`, `liferay/`, `.liferay-cli.yml`, and bootstrap-module files stay as they are
- template changes in a new `ldev` release must be reviewed and applied deliberately

This is intentional. For a Java-heavy local stack with real data, local overrides, and team-specific bootstrap changes, blind scaffold rewrites are riskier than an explicit manual review.

## 3. When a project upgrade is worth doing

Consider reviewing scaffold updates when:

- the documented DXP baseline changes
- Docker or Elasticsearch defaults change
- `doctor` or `start` behavior depends on new config keys
- pre-startup scripts change
- bootstrap module behavior changes
- release notes mention template, scaffold, or local-runtime changes

If none of those happened, upgrading only the CLI may be enough.

## 4. Files that usually matter in a scaffold upgrade

Review these first:

- `docker/docker-compose.yml`
- `docker/.env.example`
- `docker/elasticsearch/Dockerfile`
- `docker/liferay-scripts/pre-startup/configure-session-cookie.sh`
- `docker/liferay-scripts/pre-startup/install-activation-key.sh`
- `.liferay-cli.yml`
- `liferay/gradle.properties`
- `liferay/settings.gradle`
- `liferay/configs/common/osgi/configs/`
- `liferay/configs/dockerenv/portal-ext.properties`
- `liferay/configs/dockerenv/portal-setup-wizard.properties`
- `liferay/configs/dockerenv/osgi/configs/com.liferay.portal.search.elasticsearch7.configuration.ElasticsearchConfiguration.config`
- `liferay/configs/dockerenv/osgi/configs/com.liferay.portal.store.file.system.configuration.AdvancedFileSystemStoreConfiguration.config`

Be more careful with these project-local files:

- `docker/.env`
- `liferay/modules/`
- project-specific edits in `portal-ext.properties`
- local patches or custom scripts under `docker/`

Those files often contain project overrides and should not be replaced blindly.

## 5. Recommended upgrade workflow for scaffolded repos

### Safe path

1. Upgrade the CLI locally.
2. Create a branch in the target repo.
3. Back up or review current local overrides, especially `docker/.env`.
4. Generate a fresh reference scaffold in a temporary directory with the new CLI version.
5. Compare that reference scaffold with your existing repo.
6. Apply only the changes you actually want.
7. Run `ldev doctor`, `ldev setup`, and `ldev start`.
8. Validate portal auth, deploy flow, and any project-specific workflows before merging.

### Example

```bash
npm install -g @mordonezdev/ldev@latest
mkdir -p /tmp/ldev-upgrade-check
ldev project init --name upgrade-check --dir /tmp/ldev-upgrade-check
diff -ru /tmp/ldev-upgrade-check/docker ./docker
diff -ru /tmp/ldev-upgrade-check/liferay ./liferay
```

Use a real diff tool or your editor if that is easier to review safely.

## 6. Upgrade checklist for an existing repo

- confirm the CLI version you are moving to
- read the GitHub release notes
- confirm the documented DXP baseline still matches your project intent
- review `docker/docker-compose.yml`
- review `docker/.env.example` without overwriting your `docker/.env`
- review `liferay/gradle.properties` for product-baseline changes
- review OAuth2 auth flow changes if the release mentions `ldev oauth install` or bundled installer updates
- run `ldev doctor`
- run `ldev setup`
- run `ldev start`
- verify login, API auth, and one deploy flow

## 7. What to do if the new scaffold differs a lot

If the diff is large:

- upgrade only the CLI first
- apply template changes in smaller commits
- separate product-baseline changes from local customizations
- avoid mixing scaffold refresh with unrelated app changes

If you are unsure whether a template change is required, prefer the smaller change and validate with `ldev doctor` plus your normal local startup flow.

## 8. Recovery if an upgrade goes badly

For the CLI:

- reinstall the previous known-good version

For a scaffolded repo:

- discard or revert the scaffold-change branch
- restore your previous `docker/.env` if you changed it
- return to the previous known-good CLI version

## 9. Current limitation

There is no first-class `ldev project upgrade` command yet.

Until that exists, the supported approach is:

- generate a fresh reference scaffold
- compare it against your repo
- apply the required changes manually

[Back to Home](/)
