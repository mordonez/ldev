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

Current CI coverage is Linux-only. If you change platform-sensitive behavior, validate it manually on macOS as well before calling it supported.

There is also a dedicated GitHub Actions runtime-smoke lane that exercises a real Docker-based environment path on Linux. Treat that workflow as the current runtime-confidence lane for release readiness.

### Individual checks

```bash
npm run lint          # ESLint
npm run format:check  # Prettier
npm run typecheck     # TypeScript strict
npm run test          # All tests
npm run test:unit     # Unit tests only
npm run test:integration  # Integration tests only
npm run test:smoke    # Smoke tests only
npm run docs:build    # Build the VitePress docs
npm run docs:check-links  # Fail on broken internal docs links
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
  const command = new Command('example').description('Example command');

  addOutputFormatOption(command.command('action').description('Do something')).action(
    createFormattedAction(async (context) => runExampleAction(context.config), {text: formatExampleAction}),
  );

  return command;
}
```

### 3. Register in the built-in command groups

Add the command to the appropriate group in `src/cli/command-groups.ts`.

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

### Command wiring patterns

All command actions must go through `withCommandContext` to get a `CommandContext` (config, printer, cwd, project). Two helpers cover the common cases:

| Case | Helper |
|------|--------|
| Options-only command | `createFormattedAction` |
| Command with a positional argument | `createFormattedArgumentAction` |

```typescript
// options-only
addOutputFormatOption(command.command('foo').description('...')).action(
  createFormattedAction(async (context, options: {bar?: string}) => runFoo(context.config, options), {text: formatFoo}),
);

// positional argument + options
addOutputFormatOption(command.command('foo').argument('<name>', '...').description('...')).action(
  createFormattedArgumentAction(async (context, name: string, options) => runFoo(context.config, name, options), {text: formatFoo}),
);
```

Use `withCommandContext` directly only when the standard helpers don't fit. Mark those sites with a `// escape-hatch:` comment explaining why. Current justified cases:
- **Interactive processes** with no return value (e.g. `osgi gogo`, `env shell`, `env logs`) — streams output directly, nothing to format
- **Streaming + batch** commands that need `context.printer.format` inside the action before a result is available (e.g. `reindex watch`) — must decide streaming vs batch based on format before running

### Testing patterns

- Features receive dependencies as parameters (dependency injection)
- Use `src/testing/` helpers for mocks and fixtures
- Integration tests spawn the CLI via `npx tsx src/index.ts`
- All commands must support `--json` output for automation

### Test taxonomy

| Lane | Directory | Script | When to use |
|------|-----------|--------|-------------|
| **unit** | `tests/unit/` | `npm run test:unit` | Pure logic, no I/O, no subprocesses. Always fast (<1s per test). |
| **integration** | `tests/integration/` | `npm run test:integration` | CLI behavior in-process or via `npx tsx` against a temp repo on disk. No Docker required. Tests that need 45s+ timeouts belong in system. |
| **smoke** | `tests/smoke/` | `npm run test:smoke` | End-to-end CLI surface against a running Docker environment. Not in default CI matrix. |
| **system** | `tests/system/` | `npm run test:system` | Tests that require high-I/O system operations: `npm pack`, `npm install`, real package lifecycle verification. Not in the default CI matrix. |

**Boundary rules:**
- `npm pack`, `npm install`, or installed-package CLI execution → **system** only
- Real Docker lifecycle (`docker compose up`, health waits) → **smoke** only
- Real `git worktree` on a temp repo without Docker → **integration** is acceptable, but extract expensive fixtures to `beforeAll` and prefer in-process CLI calls where possible
- Everything else that doesn't fit unit → **integration**

The `npm test` script (`vitest run`) runs all lanes. CI runs `test:unit` and `test:integration` as the primary quality gate. `test:smoke` and `test:system` are available for manual and release verification.

### Output contract

All commands support three output formats: `text`, `json`, `ndjson`.

- `text` is the default, human-readable format
- `json` and `ndjson` are machine-readable and part of the automation contract
- JSON schema changes are additive-only within a major version

### CLI writing

- Public CLI help, errors, progress messages, and formatted text output must be written in English
- Keep messages short, technical, and explicit about the next useful action
- Avoid mixing languages in the same workflow, even for internal tooling commands that are user-visible

## Support Levels And Scope Guardrails

Before adding or expanding a command, classify it:

- `core` for first-run onboarding and daily local workflow
- `specialized but supported` for real secondary workflows
- `internal / maintainer-facing` for automation, diagnostics, migration, release, or repository maintenance

Guardrails:

- Do not add generic plugin-platform work.
- Do not widen `ldev` into a broad cross-stack tool.
- Do not add new top-level namespaces without strong evidence that they are central.
- Do not add speculative abstractions for hypothetical future extensibility.

## Pull Requests

1. Create a feature branch from `main`
2. Make your changes
3. Run `npm run check` to verify everything passes
4. Open a PR with a clear description
5. Wait for CI to pass and a maintainer review

### README release gate

Before merging a release-impacting PR, confirm the README stays intentionally short:

- [ ] README includes only: value proposition, installation, quickstart (3–5 commands), brief scope/fit guidance (which may link to Product Compatibility / Support Matrix instead of a standalone “Who is this for / Not for” section), and key links
- [ ] Detailed capability explanations are kept in `docs/capabilities.md` (not re-expanded in README)
- [ ] Workflow-specific deep dives live in dedicated docs pages (for example: portal inventory, resource migration, AI workflows, worktree, automation)
- [ ] Any new README section is justified as top-level onboarding content and links to docs for details
- [ ] Docs-site links remain valid (`npm run docs:check-links` if doc links changed)

## Support And Security

- Use [SUPPORT.md](SUPPORT.md) for issue-triage expectations and what belongs in normal issues
- Use [SECURITY.md](SECURITY.md) for private vulnerability reporting
