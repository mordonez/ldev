---
title: Contributing
description: Development guide for ldev. Learn how to set up the local environment, run tests, and contribute new features or commands.
---

# Contributing

See [CONTRIBUTING.md](https://github.com/mordonez/ldev/blob/main/CONTRIBUTING.md) for the full development workflow, testing patterns, and code conventions.

For release operations, dry runs, artifacts, and rollback guidance, see [Releasing](/releasing).
For issue-triage and security-reporting expectations, see [SUPPORT.md](https://github.com/mordonez/ldev/blob/main/SUPPORT.md) and [SECURITY.md](https://github.com/mordonez/ldev/blob/main/SECURITY.md).

## Quick Setup

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm run build
npm test
```

## Development Loop

```bash
npm link              # Link binary globally
npm run build:watch   # Rebuild on changes
```

Then use `ldev` in any project directory — changes take effect immediately.

## Docs Loop

```bash
npm run docs:dev      # Start the VitePress docs site locally
npm run docs:build    # Verify the docs build for CI/GitHub Pages
npm run docs:check-links  # Verify internal docs links against the built site
```

## Quality Checks

```bash
npm run check         # Full suite: lint + format + typecheck + test + build
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # TypeScript
npm run test:unit     # Unit tests
npm run test:coverage # Coverage with 70% threshold
```

## Adding a New Command

1. Create feature logic in `src/features/<domain>/`
2. Create command registration in `src/commands/<domain>/`
3. Register in the appropriate built-in command group in `src/cli/builtin-plugins.ts`

See [CONTRIBUTING.md](https://github.com/mordonez/ldev/blob/main/CONTRIBUTING.md) for a detailed walkthrough with code examples.

## Support Levels

Before adding or expanding a command, classify it explicitly:

- `core`: first-run onboarding or daily local workflow
- `specialized but supported`: valid workflow, but clearly secondary to onboarding
- `internal / maintainer-facing`: automation, diagnostics, migration, release, or repository maintenance

Do not promote an internal command into the public product story by accumulation.

## Architecture

```
src/
├── cli/           Command parsing, internal command-group wiring, context
├── commands/      Thin command registrations (Commander wrappers)
├── features/      Business logic (pure functions, testable)
├── core/          Config, HTTP client, output formatting, platform
└── testing/       Test helpers and fixtures
```

## Scope Guardrails

Contributors should optimize for a sharper tool, not a larger one.

- Do not add generic plugin-platform work.
- Do not widen `ldev` into a cross-stack environment manager.
- Do not add new top-level namespaces without strong evidence that the workflow is central.
- Do not add speculative abstractions for hypothetical future extensibility.

[Back to Home](./)
