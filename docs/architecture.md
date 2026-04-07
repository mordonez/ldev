# Architecture

`ldev` is a TypeScript CLI focused on Liferay local environments. The architecture is intentionally simple:

- thin Commander command registrations
- feature modules with most of the business logic
- shared core services for config, platform/process execution, HTTP, and output
- template assets versioned with the CLI

## What ldev is

- a Liferay-focused local development CLI
- a Docker-oriented environment manager for local Liferay work
- a tool for portal inspection, resource workflows, deploy assistance, OSGi/runtime diagnostics, and troubleshooting

## What ldev is not

- a general-purpose local environment manager for every stack
- a stable public plugin platform
- a replacement for Gradle, Liferay DXP itself, or all platform-specific tooling
- a generic cross-stack toolbox with every useful advanced namespace promoted equally

## Product stance

The design goal is not to emulate a generic local-environment product. The design goal is to make Liferay local work feel operationally boring:

- consistent Docker bootstrap
- clear failure diagnostics
- better portal-aware automation
- smoother Java-heavy deploy/debug loops

## Source layout

```text
src/
├── cli/        Root CLI wiring, plugin registration, command context
├── commands/   Commander registrations and help text
├── core/       Config, platform, HTTP, output, shared utilities
├── features/   Domain logic for env, project, portal, deploy, db, osgi, worktree
└── testing/    Fakes, temp repos, and test helpers
```

## Command model

Commands should stay thin:

- parse arguments
- call a feature function
- format output through the shared command helpers

Business rules should live in `src/features`, not in Commander setup code.

## Internal command grouping

`ldev` uses an internal command-group contract to organize built-in commands and root-help sections. This is code organization first.

It does **not** currently mean that `ldev` offers a stable external plugin API for third parties.

Nothing in `src/cli` should be treated as a stable public extension surface unless the docs explicitly say so.

## Support levels

`ldev` keeps its command surface intentionally uneven:

- `core`: daily local workflow and first-run onboarding
  `doctor`, `setup`, `start`, `stop`, `status`, `logs`, `shell`, `project`, `portal check`, `portal auth`
- `specialized but supported`: real workflows that remain secondary to onboarding
  advanced `portal`, `resource`, `deploy`, advanced `env`, `db`, `osgi`, `worktree`
- `internal / maintainer-facing`: useful for automation, diagnostics, release work, or repository maintenance, but not part of the main product story
  `context`, `health`, `perf`, `snapshot`, `restore`, `ai`

Internal commands may stay available without being promoted as top-level product surface.

## Scope guardrails

After launch, `ldev` should refuse growth that weakens its product shape:

- no generic plugin platform work without strong real demand
- no broad cross-stack roadmap or generic environment-manager positioning
- no new top-level namespaces without strong evidence that the workflow is central
- no speculative abstractions added mainly for future extensibility

Prefer tightening existing core and specialized workflows over adding new surface area.

## Config layering

`ldev` resolves configuration from:

1. process environment
2. `docker/.env`
3. `.liferay-cli.yml`
4. built-in defaults

Use `ldev doctor` and `ldev context --json` to inspect the effective configuration.

## Docs ownership

When a public command changes, update all of these together:

- the relevant help text
- the command reference
- troubleshooting if the failure modes changed
- tests that lock the public contract

For portal integration design, also keep these references aligned:

- [OAuth2 Scopes](/oauth-scopes)
- [API Surfaces](/api-surfaces)
- [MCP Strategy](/mcp-strategy)

For TypeScript module boundaries inside `src/features/liferay/`, see [Liferay Domain](/liferay-domain).
