---
title: FAQ
description: Common questions about ldev scope, runtime models, agents, and resource workflows.
---

# FAQ

## Is `ldev` a generic CLI for any Java project?

No. It is specifically shaped around Liferay maintenance and troubleshooting workflows.

## Does `ldev` only work with the `ldev-native` Docker layout?

No. It can also run on top of a standard Blade workspace.

## Does `ldev` replace Liferay Workspace?

No. You can use `ldev` as an operational layer on top of Liferay Workspace when that is already your team standard.

## Does `ldev` replace the Liferay Cloud CLI?

No. For `db download`, `db sync`, and `db files-download`, `ldev` uses the Liferay Cloud CLI (`lcp`) under the hood.

## Can I import a local SQL file without using Liferay Cloud?

Yes.

```bash
ldev db import --file /path/to/backup.sql.gz --force
```

## Is `db files-download` a generic file migration command?

No. It is specifically for Document Library content from Liferay Cloud backups.

If the files come from another source, copy them manually and mount them with:

```bash
ldev db files-mount --path /path/to/manual/doclib
```

## Can I use only the portal and resource commands?

Yes. If you already have a running Liferay instance and credentials, you can use `portal`, `resource`, and `ai` workflows without adopting the full local runtime.

## Which Liferay versions are supported?

`ldev` is designed for modern Liferay DXP 7.4 environments (including common quarterly/update lines).

Practical guidance:

- If your project is on DXP 7.4, `ldev` commands and workflows are the primary supported target.
- If your environment is older or heavily customized, some endpoints/behaviors may differ and require command-level workarounds.
- When in doubt, validate in your target runtime with:

```bash
ldev portal check
ldev portal inventory sites
ldev resource list --site guest
```

If one of these baseline commands fails due to version-specific API differences, treat that runtime as partially compatible and document the gap in your project notes.

## Why are resource commands important?

Because they let you export, review, import, and migrate structures, templates, ADTs, and fragments as files instead of manual UI steps.

## What does `ldev ai install` actually do?

It bootstraps the repo for coding agents by installing `AGENTS.md`, managed skills, and optional project overlays.
