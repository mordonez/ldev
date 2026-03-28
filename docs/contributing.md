---
layout: default
title: Contributing
---

# Contributing

See [CONTRIBUTING.md](https://github.com/mordonez/ldev/blob/main/CONTRIBUTING.md) for the full development workflow, testing patterns, and code conventions.

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
3. Register in the appropriate built-in plugin in `src/cli/builtin-plugins.ts`

See [CONTRIBUTING.md](https://github.com/mordonez/ldev/blob/main/CONTRIBUTING.md) for a detailed walkthrough with code examples.

## Architecture

```
src/
├── cli/           Command parsing, plugin system, context
├── commands/      Thin command registrations (Commander wrappers)
├── features/      Business logic (pure functions, testable)
├── core/          Config, HTTP client, output formatting, platform
└── testing/       Test helpers and fixtures
```

[Back to Home](./)
