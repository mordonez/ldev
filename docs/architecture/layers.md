# ldev — Formal Layer Model

This document is the authoritative reference for `ldev`'s source-code layer model. It describes what each layer is, what belongs in it, what does not, and which imports are allowed or forbidden. The target audience is a new contributor opening the repo for the first time.

---

## Overview

`ldev` is a single TypeScript package that builds one Node.js binary. Its source is organised in a strict layer hierarchy. Code flows inward — outer layers call inner layers, never the reverse.

```
src/index.ts           (ldev binary)
        |
        v
src/entrypoints/       (external runtime surfaces)
src/cli/               (Commander wiring)
        |
        v
src/commands/          (thin CLI registrations)
        |
        v
src/features/          (business logic per domain)
        |
        v
src/core/              (shared abstractions — no domain knowledge)
```

```
index.ts
    |
    v
entrypoints/  (dashboard)    cli/
    |                          |
    +-------> commands/ <------+
                   |
                   v
               features/
                   |
                   v
                 core/
```

`src/testing/` is a lateral layer: test helpers only, never imported by production code.

---

## Layer Reference

### `src/index.ts` — Binary Entrypoint

**Purpose.** The file that becomes the published binary. Minimal: parse argv for `--version`/`--help`, then delegate entirely to the next layer. Contains zero business logic.

**What belongs here.**
- Shebang line (`#!/usr/bin/env node`)
- Top-level error catch with `process.exit`
- A single import of the layer immediately below (`cli/`)
- Version string resolution at the binary boundary

**What does NOT belong here.**
- Any business logic
- Any Commander `Command` construction
- Any feature function calls

**Allowed dependencies.** `cli/`, `core/errors-sanitize` (for error display).

**Forbidden dependencies.** `features/`, `commands/`, `core/` (beyond errors), any third-party library except Node builtins.

**Examples from the codebase.**
- `src/index.ts` — calls `createCli()` from `cli/create-cli`, then `cli.parseAsync(process.argv)`. The entire error display path is 12 lines.

---

### `src/cli/` — Commander Wiring

**Purpose.** The only layer that knows about Commander. Provides the root `Command` object, context resolution, error normalisation, output format detection, and contextual help generation. `cli/` is the glue between Node argv and the command layer.

**What belongs here.**
- `createCli()` — root Commander program factory (`create-cli.ts`)
- `CommandGroup` interface and `COMMAND_GROUPS` registry (`command-group.ts`, `command-groups.ts`)
- `CommandContext` type and `withCommandContext` / `resolveCommandRoot` helpers (`command-context.ts`)
- `createFormattedAction` / `createFormattedArgumentAction` helpers (`command-helpers.ts`)
- CLI-level error types and normalisation (`errors.ts`)
- Contextual help builders (`contextual-help.ts`)

**What does NOT belong here.**
- Business logic of any kind
- Direct HTTP or FS access (use `core/platform/` or `core/http/`)
- Feature-specific knowledge (command groups register commands, they do not know what commands do)

**Allowed dependencies.** `core/` (all sub-packages), Node builtins, `commander`.

**Forbidden dependencies.** `features/`, `entrypoints/`, any business-domain type.

**Examples from the codebase.**
- `src/cli/command-groups.ts` — imports all `commands/*/` factories and assembles the Commander tree. Contains no logic.
- `src/cli/command-helpers.ts` — `createFormattedAction` wraps the feature call inside a `withCommandContext` and dispatches output to the printer.
- `src/cli/errors.ts` — `normalizeCliError` turns any thrown value into a `CliError` with code and exit code.

---

### `src/commands/` — Thin CLI Registrations

**Purpose.** One directory per command namespace. Each file registers Commander subcommands: options, arguments, descriptions, and the action that calls exactly one feature function. Commands are the translation layer between Commander's option bags and feature function parameters.

**What belongs here.**
- `create<Domain>Command(): Command` factories
- Commander option and argument registration
- Calls to `createFormattedAction` / `createFormattedArgumentAction`
- Calls to feature functions (exactly one per action, no orchestration)
- `--dry-run` flag wiring for destructive commands

**What does NOT belong here.**
- Business logic (loops, conditionals on data, HTTP calls)
- Output formatting beyond passing `{text: formatFoo}` to the action helper
- Direct `process.stdout`/`process.stderr` writes (use the printer from `CommandContext`)
- Cross-command orchestration (e.g., calling two different feature domains)

**Allowed dependencies.** `cli/` (helpers and context), `features/` (one call per action), `core/` (types only, primarily `AppConfig`).

**Forbidden dependencies.** Other `commands/` files, `entrypoints/`.

**Current namespaces.**

| Directory | Commander namespace | Notes |
|-----------|--------------------|----|
| `commands/ai/` | `ldev ai` | Hidden command group (agentic installer) |
| `commands/context/` | `ldev context` | Print resolved project context |
| `commands/dashboard/` | `ldev dashboard` | Start the HTTP dashboard server |
| `commands/db/` | `ldev db` | Database operations |
| `commands/deploy/` | `ldev deploy` | Build and deploy artifacts |
| `commands/doctor/` | `ldev doctor` | Environment diagnostics |
| `commands/env/` | `ldev env` | Advanced Docker lifecycle operations |
| `commands/liferay/` | `ldev liferay` | Portal API tooling (inventory, audit, resources) |
| `commands/liferay/` (mcp subcommand) | `ldev portal mcp` | Liferay portal MCP probe (check/probe/openapis) |
| `commands/oauth/` | `ldev oauth` | OAuth2 bundle install |
| `commands/osgi/` | `ldev osgi` | OSGi diagnostics |
| `commands/project/` | `ldev project` | Project scaffolding |
| `commands/reindex/` | `ldev reindex` | Search reindex |
| `commands/resource/` | `ldev resource` | Fragment/ADT/structure/template sync |
| `commands/worktree/` | `ldev worktree` | Git worktree management |

**Examples from the codebase.**
- `src/commands/dashboard/dashboard.command.ts` — 32 lines. Registers `--port` and `--no-open` options, calls `createDashboardServer()`, then awaits `new Promise<never>()`.
- `src/commands/env/env.command.ts` — delegates subcommand registration to `registerEnvOperationsCommands` and `registerEnvDiagnosticsCommands`, each in their own file.
- `src/commands/liferay/inventory.command.ts` — `createFormattedAction` calls `runLiferayInventorySites`, `formatInventorySites` comes from the feature.

---

### `src/entrypoints/` — External Runtime Surfaces

**Purpose.** Non-CLI runtime surfaces. Currently one: the web dashboard (HTTP server). Entrypoints aggregate multiple features into a cohesive API surface. They are categorically different from features: a feature is a pure domain unit; an entrypoint is an external-facing runtime process.

**What belongs here.**
- HTTP route registration and dispatch (`dashboard-server.ts`, `dashboard-*-routes.ts`)
- Route handlers that call feature functions and marshal responses
- Task manager, worker resolver, SSE streaming plumbing (dashboard-specific infrastructure)

**What does NOT belong here.**
- Business logic — route handlers call feature functions; they do not re-implement domain logic
- Commander types or `commander` imports
- Imports from other entrypoints

**Allowed dependencies.** `features/`, `core/`, Node builtins, `hono`/HTTP libraries (dashboard only).

**Forbidden dependencies.** `cli/`, `commands/`, other entrypoints.

**Sub-directories.**

```
src/entrypoints/
└── dashboard/           # HTTP server (node:http), routes, task runner, client assets
    ├── client/          # Preact SPA source (compiled separately via Vite)
    └── *.ts             # Server-side route handlers and HTTP infra
```

**Examples from the codebase.**
- `src/entrypoints/dashboard/dashboard-server.ts` — creates an `http.Server`, wires every route, delegates each route handler to a named function (one per concern). No domain logic inlined.

---

### `src/features/` — Business Logic Per Domain

**Purpose.** The core of `ldev`. All non-trivial logic lives here, organised one directory per domain. Features are pure-ish: they accept config and dependencies as parameters, return typed data, and may have side effects (HTTP, FS, Docker) at the leaves via `core/platform/` and `core/http/`. No feature knows about Commander or HTTP route shapes.

**What belongs here.**
- Domain functions: `run<Domain><Action>(config, options?, deps?)` → typed result
- Text formatters: `format<Domain><Action>(result)` → string (co-located with the function)
- Domain error codes: `features/<domain>/errors/<domain>-error-codes.ts`
- Domain error factories: `features/<domain>/errors/<domain>-error-factory.ts`
- Internal types used only within the domain
- Zod schemas that are internal to the feature (not published to `core/contracts/`)

**What does NOT belong here.**
- Commander option types or imports
- `@modelcontextprotocol/sdk` imports
- HTTP route plumbing (request/response parsing)
- Global mutable state

**Allowed dependencies.** `core/` (all sub-packages), Node builtins, npm packages (`execa`, `jszip`, `yaml`, `zod`, etc.), other `features/` files for cross-domain calls (avoid cycles).

**Forbidden dependencies.** `cli/`, `commands/`, `entrypoints/`, `testing/`.

**Domain inventory.**

| Domain | Directory | Notes |
|--------|-----------|-------|
| Agent bootstrap | `features/agent/` | Runtime context for `ldev ai bootstrap` |
| AI (agentic installer) | `features/ai/` | `ldev ai install` logic |
| Database | `features/db/` | DB backup, import, sync, query |
| Deploy | `features/deploy/` | Gradle builds, hot deploy, theme deploy |
| Doctor | `features/doctor/` | Environment diagnostic probes and report assembly |
| Environment | `features/env/` | Docker Compose lifecycle (start, stop, recreate, etc.) |
| Liferay portal | `features/liferay/` | All Liferay API interactions — largest domain (55% of features LOC) |
| Liferay MCP probe | `features/liferay-mcp/` | Client that talks to Liferay's own MCP endpoint (not ldev's server) |
| OAuth | `features/oauth/` | OAuth2 bundle installation and verification |
| OSGi | `features/osgi/` | Gogo shell, heap dump, thread dump, bundle status |
| Project | `features/project/` | Project scaffolding |
| Reindex | `features/reindex/` | Search engine reindex and status |
| Worktree | `features/worktree/` | Git worktree create/clean/GC/flow |

**Error pattern.** Each domain with destructive or complex error paths has its own error module:

```
features/<domain>/errors/
├── <domain>-error-codes.ts    # const object of CODE strings
└── <domain>-error-factory.ts  # named factory functions → CliError
```

Example (`features/db/errors/`):
- `db-error-codes.ts` exports `DbErrorCode.SYNC_STATE_MISSING = 'DB_SYNC_STATE_MISSING'`
- `db-error-factory.ts` exports `DbErrors.syncStateMissing(msg, opts)` which calls `createDomainError(msg, DbErrorCode.SYNC_STATE_MISSING, opts)`

Do not add domain error codes to a shared enum. Domains that have added error codes: `db`, `deploy`, `env`, `liferay`, `oauth`, `worktree`.

**Renderer convention.** Text formatters (`formatX`) live in the same file as the function they format, not in a shared `renderers/` layer. This keeps format logic next to the data it renders and avoids false abstraction.

**Examples from the codebase.**
- `src/features/liferay/inventory/liferay-inventory-sites.ts` — `runLiferayInventorySites(config, options?, deps?)` returns `LiferayInventorySite[]`; the evidence contract Zod schema is imported from `core/contracts/`.
- `src/features/doctor/doctor-format.ts` — `formatDoctor(report)` and `assembleDoctorReport()` are co-located. The formatter is 155 lines of pure string-building.
- `src/features/env/errors/env-error-factory.ts` — `EnvErrors.capabilityMissing(msg)` wraps `createDomainError` with `EnvErrorCode.CAPABILITY_MISSING`.

---

### `src/core/` — Shared Abstractions

**Purpose.** Infrastructure shared across all layers. `core/` has no domain knowledge. It does not know about Liferay, Docker Compose configuration, or worktrees. It provides the building blocks that features and entrypoints use.

**Sub-packages.**

| Sub-package | Purpose | Key files |
|-------------|---------|-----------|
| `core/config/` | Project detection, config loading, `AppConfig` schema | `schema.ts`, `project-context.ts`, `config-builder.ts` |
| `core/contracts/` | Versioned Zod schemas for automation-consumed JSON | `inventory.schema.ts`, `resource.schema.ts`, `shared.schema.ts` |
| `core/errors.ts` | `CliError` class, `createDomainError` factory | — |
| `core/errors-sanitize.ts` | Secret-scrubbing before error messages are printed | — |
| `core/http/` | OAuth2 token client, HTTP API client, latency tracking | `auth.ts`, `client.ts` |
| `core/output/` | Printer (stdout/stderr), output format types, run-step helper | `printer.ts`, `formats.ts` |
| `core/platform/` | Thin wrappers for Docker, Git, FS, process | `docker.ts`, `git.ts`, `fs.ts`, `process.ts` |
| `core/runtime/` | Runtime adapter interface, Blade/ldev-native adapters, GoGo client | `runtime-adapter.ts`, `gogo-command.ts` |
| `core/utils/` | Async helpers, coercion, JSON parsing, text utilities | `async.ts`, `json.ts` |
| `core/concurrency.ts` | Concurrency limiter | — |

**What belongs here.**
- Types shared by more than one domain or layer
- `AppConfig` and its Zod schema (the primary config contract between config loading and all consumers)
- Thin platform wrappers with no business logic
- Shared error infrastructure
- Versioned output contracts for automation consumers

**What does NOT belong here.**
- Domain logic (e.g., "how to deploy a fragment")
- Commander types
- Feature-specific error codes (those live in `features/<domain>/errors/`)

**Allowed dependencies.** Node builtins, npm packages (`zod`, `execa`, `yaml`, etc.), no other `src/` layers.

**Forbidden dependencies.** `cli/`, `commands/`, `features/`, `entrypoints/`, `testing/`.

**Examples from the codebase.**
- `src/core/config/schema.ts` — `appConfigSchema` is the Zod schema for `AppConfig`. Every feature and entrypoint accepts `AppConfig` as its primary config parameter.
- `src/core/platform/docker.ts` — `runDockerCompose(cwd, args, options)` wraps `execa`. No knowledge of what `docker compose up` means to the env feature.
- `src/core/contracts/inventory.schema.ts` — `liferayInventorySitesSchema`, `whereUsedResultSchema`, etc. Consumed by the inventory feature and the dashboard.

---

### `src/testing/` — Test Helpers

**Purpose.** Utilities used exclusively by tests. Not published; not imported by production code. Provides CLI invocation helpers, fake platform implementations, and temp repo utilities.

**What belongs here.**
- `cli-entry.ts` / `cli-test-helpers.ts` — `runCli`, `spawnCli` that resolve `dist/index.js` or `tsx src/index.ts` dynamically
- `fake-docker.ts` — in-process Docker stub for unit tests
- `temp-repo.ts` — creates a temp directory with a minimal repo structure

**What does NOT belong here.**
- Production logic of any kind
- Any import from `commands/`, `features/`, `entrypoints/`, or `cli/` production modules (test helpers call `runCli()`, they do not import feature functions directly)

**Allowed dependencies.** Node builtins, `core/platform/` (for `runProcess`), test framework utilities.

**Forbidden dependencies.** `cli/` (beyond re-exporting CLI entry), `commands/`, `features/`, `entrypoints/`.

---

## Cross-Cutting Concerns

### Errors

The error hierarchy:

```
CliError (src/core/errors.ts)
    ↑
createDomainError(message, code, options)
    ↑
DbErrors.syncStateMissing()     // features/db/errors/
EnvErrors.capabilityMissing()   // features/env/errors/
WorktreeErrors.notFound()       // features/worktree/errors/
LiferayErrors.*                 // features/liferay/errors/
```

All errors ultimately become `CliError` with a string code and numeric exit code. The CLI layer (`src/index.ts`) catches them and serialises them to text or JSON depending on `--json`/`--ndjson`.

Secret values are scrubbed by `sanitizeErrorMessage` in `src/core/errors-sanitize.ts` before being written to stderr.

### Contracts

All JSON output consumed by automation (dashboard API, `--json` output that external scripts parse) must have a Zod schema under `src/core/contracts/`. See [contracts.md](./contracts.md) for the full guide.

### Config

`AppConfig` (defined in `src/core/config/schema.ts`) is the runtime configuration object passed into every feature function as the first parameter. It is produced by `resolveProjectContext()` in `src/core/config/project-context.ts`. There is no global singleton — each `resolveProjectContext()` call produces an independent `AppConfig` from environment and file system.

---

## Architectural Principles

The following principles describe what the codebase already does. They exist so reviewers can cite them rather than re-derive them.

1. **One entrypoint per binary.** `src/index.ts` delegates immediately. No logic in the binary entry file.

2. **`cli/` is the only place that knows Commander.** No feature, no entrypoint, may import `commander`. This is enforced by ESLint import rules.

3. **`commands/` is thin.** A command file registers options, parses args, and calls one feature function. No business logic, no I/O orchestration.

4. **`features/` is pure-ish.** Features take config and explicit dependencies as parameters, return typed data, and may have side effects (HTTP, FS, Docker) at the leaves only. No feature imports `cli/` or `commands/`.

5. **`entrypoints/` hosts non-CLI runtime surfaces.** Currently the dashboard only. Entrypoints may import `features/` and `core/`. Entrypoints do not import each other and do not import `cli/` or `commands/`.

6. **`core/` is shared infra with no domain knowledge.** Things in `core/contracts/` are versioned in spirit: additive within a major version, breaking changes require a version bump.

7. **Dashboard routes must not contain business logic.** Route handlers in `entrypoints/dashboard/` call feature functions; they do not implement domain logic inline.

8. **Output is feature-local for text, schema-versioned for JSON consumed by automation.** Dashboard JSON and documented `--json` output must have a contract under `core/contracts/`. CLI-only JSON output does not need a versioned schema.

9. **Errors carry codes.** Per-feature error registries exist under `features/<domain>/errors/`. Extend the pattern, do not consolidate into a global enum.

10. **Destructive commands support dry-run.** Commands that mutate state (db reset, env destroy, worktree clean, env recreate) must accept `--dry-run` and print what would happen without executing. This is a default expectation for new destructive commands.

11. **Formatters live next to the function they format.** There is no generic `renderers/` layer. `formatFoo` and `runFoo` live in the same file or adjacent files within the same domain directory.

12. **External adapters are isolated.** HTTP, Docker, FS, and Git adapters live in `core/platform/` or at the leaves of feature files. They are never scattered across the domain.

13. **Feature functions are pure or dependency-injected.** Dependencies (HTTP client, token client, platform utilities) are accepted as optional parameters with production defaults. This enables unit testing without subprocess or network.

14. **Naming is concrete, not generic.** `liferay-mcp` not `mcp`; `dashboard-task-routes` not `routes`. Avoid `manager`, `handler`, `helper` as suffixes unless there is genuinely no better word.

15. **All output JSON consumed by automation must have a Zod schema in `core/contracts/`.** This includes dashboard API responses that external consumers parse.

16. **Error codes must be consistent per feature domain.** The `features/*/errors/` pattern (codes file + factory file) is the standard. New domains that add error codes must follow this pattern.
