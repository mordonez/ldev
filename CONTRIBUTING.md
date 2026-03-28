# Contributing to ldev

Thank you for your interest in contributing to ldev! This guide covers the development workflow, conventions, and how to add new commands.

## Getting Started

```bash
git clone git@github.com:mordonez/ldev.git
cd ldev
npm install
npm link
npm run build:watch  # in a separate terminal
```

## Development Workflow

### Running from source

```bash
npm run dev -- doctor --json
```

### Quality checks

```bash
npm run check  # lint + format:check + typecheck + test + build
```

### Individual checks

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # TypeScript strict
npm run test          # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:smoke    # Smoke tests only
```

## Project Structure

```
src/
├── index.ts              # CLI entry point
├── cli/                  # CLI framework (context, helpers, errors)
├── commands/             # Command registration (thin wrappers)
│   └── [domain]/         # One folder per command namespace
├── features/             # Business logic (pure functions)
│   └── [domain]/         # One folder per feature domain
├── core/                 # Shared abstractions
│   ├── config/           # Project detection and config loading
│   ├── http/             # HTTP client and OAuth2 auth
│   ├── output/           # Printer and output formats
│   └── platform/         # Docker, Git, FS, process wrappers
└── testing/              # Test utilities (not published)
```

## Adding a New Command

### 1. Create the feature

Create a file in `src/features/[domain]/`:

```typescript
// src/features/example/example-action.ts
import type {AppConfig} from '../../core/config/schema.js';

export type ExampleResult = {
  message: string;
};

export async function runExampleAction(config: AppConfig): Promise<ExampleResult> {
  return {message: 'done'};
}

export function formatExampleAction(result: ExampleResult): string {
  return result.message;
}
```

### 2. Create the command

Create a file in `src/commands/[domain]/`:

```typescript
// src/commands/example/example.command.ts
import {Command} from 'commander';
import {addOutputFormatOption, createFormattedAction} from '../../cli/command-helpers.js';
import {runExampleAction, formatExampleAction} from '../../features/example/example-action.js';

export function createExampleCommand(): Command {
  const command = new Command('example')
    .description('Example command');

  addOutputFormatOption(
    command.command('action').description('Do something'),
  ).action(createFormattedAction(
    async (context) => runExampleAction(context.config),
    {text: formatExampleAction},
  ));

  return command;
}
```

### 3. Register in the command registry

Add to `src/cli/command-registry.ts`:

```typescript
{group: 'Your group:', factory: () => createExampleCommand()},
```

### 4. Add tests

- Unit test in `tests/unit/` for the feature logic
- Integration test in `tests/integration/` for CLI execution
- Smoke test in `tests/smoke/` if it's a user-facing workflow

## Conventions

### Code style

- **ESLint** and **Prettier** enforce the style — run `npm run lint:fix && npm run format` before committing
- Use `type` imports: `import type {Foo} from './foo.js'`
- All imports use `.js` extensions (ESM)

### Commit messages

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` — new feature
- `fix:` — bug fix
- `refactor:` — code change that neither fixes a bug nor adds a feature
- `docs:` — documentation only
- `test:` — adding or updating tests
- `chore:` — maintenance tasks

### Testing patterns

- Features receive dependencies as parameters (dependency injection)
- Use `src/testing/` helpers for mocks and fixtures
- Integration tests spawn the CLI via `npx tsx src/index.ts`
- All commands must support `--json` output for automation

### Output contract

All commands support three output formats: `text`, `json`, `ndjson`.

- `text` is the default, human-readable format
- `json` and `ndjson` are machine-readable and part of the automation contract
- JSON schema changes are additive-only within a major version

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run check` to verify everything passes
4. Open a PR with a clear description
5. Wait for CI to pass and a maintainer review
