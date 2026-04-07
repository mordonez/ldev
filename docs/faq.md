---
title: FAQ
description: Frequently asked questions about ldev, its comparison with other tools, and best practices.
---

# FAQ

## Is `ldev` a general-purpose Docker environment tool?

No. It is intentionally focused on Liferay local environments and adjacent portal workflows.

## Is `ldev` trying to replace DDEV?

No. `ldev` is a Liferay-native tool with a narrower scope and a different product target.

It is fair to say that `ldev` is inspired by the DX bar set by tools like DDEV. It is not fair to describe it as “DDEV for Liferay” or as a general-purpose clone. The product shape, scope, and workflow priorities are intentionally different.

## Does `ldev` require Docker?

Yes, for the local environment workflows it manages directly.

## Does `ldev` work on Windows?

Native Windows is not a supported target right now. WSL2 is experimental. Check the [Support Matrix](/support-matrix) before adopting it on a team.

## Do I need Java installed?

For some local Liferay build and Gradle workflows, yes. `ldev doctor` will warn when Java is missing because some module/theme workflows depend on it.

## Is there a stable public plugin API?

No. `ldev` uses internal command grouping to organize built-in namespaces, but that is not a stable external extension API.

## Can I use only the portal and resource commands?

Yes, if you already have a running Liferay instance and the required credentials. The local environment commands are not mandatory for every workflow.

## What makes `ldev` specifically Liferay-native?

The tool is shaped around Liferay realities:

- DXP activation-key handling
- portal auth and API checks
- OSGi/runtime troubleshooting
- deploy assistance for Java-heavy local repos
- resource sync for structures, templates, fragments, and ADTs

## How do I roll back to a previous CLI version?

Install a specific version directly:

```bash
npm install -g @mordonezdev/ldev@0.1.0
```

Or run a specific version with `npx`:

```bash
npx @mordonezdev/ldev@0.1.0 --help
```

See [Upgrading](/upgrading) for the broader workflow, including scaffolded-project refresh guidance.

## Where should I start when something is broken?

Run:

```bash
ldev doctor
```

Then read [Troubleshooting](/troubleshooting) if the output points to a known failure mode.
