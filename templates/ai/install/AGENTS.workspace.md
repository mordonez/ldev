# AGENTS

Standard entrypoint for coding agents working in a **Liferay Workspace** that uses `ldev`.

This file is intentionally small. In a Workspace, the official Liferay AI files
are the base layer. `ldev` augments that base with direct workflows, runtime
guidance, and reusable skills on top.

## Base Context

Treat these files as the primary Workspace guidance:

- `.workspace-rules/*.md`
- `.claude/CLAUDE.md`
- tool-specific Workspace AI files under `.cursor/`, `.gemini/`, `.github/`, `.windsurf/`

`ldev` installs complementary `ldev-*` rule files in those locations. Do not
replace the official Workspace files with vendor-specific rewrites.

Mental model:

- official AI Workspace files explain the standard Liferay Workspace baseline
- `ldev` adds task-shaped workflows, runtime diagnostics, deploy verification,
  OAuth bootstrap, MCP checks, and agent-oriented shortcuts

If both layers speak to the same topic:

- keep the official Workspace files as the base source
- treat `ldev-*` rules as the augmentation layer for direct operational work

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev ai bootstrap --intent=develop --cache=60 --json`.
2. Run `ldev doctor --json` only when the task needs extra runtime health,
   installed tooling, browser automation, deploy verification, or diagnosis.
3. Run `ldev mcp check --json` only when the task depends on MCP or no direct
   `ldev` command covers the required portal surface.
4. Read `docs/ai/project-context.md` if it exists.
5. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Optional Shell Helpers

- `jq` is not installed by default on every machine. Check with `jq --version`.
- Install when needed:
  - Windows: `winget install jqlang.jq`
  - macOS: `brew install jq`
  - Linux (Debian/Ubuntu): `sudo apt install jq`
- In reusable agent docs, prefer direct JSON parsing by the agent or shell-native
  parsing (`ConvertFrom-Json` in PowerShell) instead of assuming `jq` exists.

## Safety Invariants

These rules apply to every task, regardless of the skill in use:

1. Always start with `ldev ai bootstrap --intent=develop --cache=60 --json`. Use `context.commands.*` and `doctor.readiness.*` to verify readiness before running any command.
2. Always consume `--json` output. Never parse human-readable text output from `ldev`.
3. Always run `--check-only` before any resource mutation (`import-structure`, `import-template`, `import-adt`, `import-fragment`, `migration-pipeline`).
4. Always use the smallest deploy or import that proves the change. Never broad-deploy as a default validation step.
5. Never use plural resource commands (`import-structures`, `export-templates`, etc.) or broad deploys without explicit human approval.
6. After any mutation, verify with operation-specific evidence:
  - Resource imports (`import-structure`, `import-template`, `import-adt`, `import-fragment`): read back the updated resource with `ldev resource structure/template/adt` / `ldev resource export-*` / `ldev portal inventory ... --json`.
  - Deploy/runtime changes (modules, themes, startup/runtime faults): use `ldev logs diagnose --since 5m --json`.
7. When the change affects rendered pages or UI, verify with browser automation after the runtime settles.
8. If a command fails, diagnose first (`ldev logs diagnose --json` or `ldev doctor --json`) before retrying.
9. Never guess IDs, keys, or site names. Use `ldev portal inventory ...` to resolve them.
10. Never assume the portal URL. Read `context.liferay.portalUrl` from bootstrap output.

If this workspace also uses `ldev-native` capabilities, apply the additional
mutating-task gates from `isolating-worktrees` and any installed project issue
workflow before changing code, resources, or runtime state.

## Workflow Rule

Prefer direct, task-shaped `ldev` commands before assembling low-level portal
operations manually.

Examples:

- `ldev portal inventory sites --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structure --site /my-site --structure <key> --json`
- `ldev resource export-template --site /my-site --template <id> --json`

Use the official Liferay MCP only when it provides something that a direct
`ldev` command does not already provide.

Prefer atomic commands. Do not use plural resource commands or a broad deploy
unless a human explicitly asks for a bulk operation and the risk is written down
first.

Use vendor skills for the full reusable workflow:

- `liferay-expert`
- `clarifying-liferay-tasks`
- `troubleshooting-liferay`
- `developing-liferay`
- `deploying-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`

Use `.workspace-rules/ldev-*.md` files to adapt those workflows to the
Workspace runtime and to coexist cleanly with the official AI Workspace rules.

Before using MCP:

- verify it with `ldev mcp check --json`
- for agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env` instead of MCP Basic auth with a human username/password
- treat MCP username/password auth as a quick manual test path, not as the default agent bootstrap
- prefer the `ldev`-managed MCP guidance if it conflicts with older Workspace template assumptions
- use MCP for generic OpenAPI discovery and endpoint execution, not as the default replacement for `ldev portal inventory`

## Default Operating Rules

- Before using a `git`, `blade`, or ad hoc shell command to accomplish something,
  check `ldev --help` to verify no `ldev` equivalent exists.
- If this repository uses isolated worktrees through `ldev`, use
  `isolating-worktrees` for the canonical setup, recovery, and cleanup flow.
- Never use `git worktree add` directly. `git worktree add` alone is incomplete
  and unsafe for that workflow.
- After creating an isolated worktree, confirm the editing root with
  `git rev-parse --show-toplevel` and treat that root as an active edit
  boundary for the whole task.
- Use **Blade/Liferay Workspace** as the standard project structure.
- Use `blade` commands when Workspace rules or docs call for them.
- Use `ldev` for diagnostics, context discovery, deploy verification, and
  agent-friendly workflows.
- Prefer singular resource commands (`export-structure`, `export-template`,
  `export-adt`, `export-fragment`, `import-structure`, `import-template`,
  `import-adt`, `import-fragment`) over plural commands.
- Prefer `ldev deploy module <module-name>` or `ldev deploy theme` over broader
  deploy commands. Do not use a broad deploy as a default validation step.
- Use `--cache=60` for read-only bootstrap intents. Omit it only when the task
  explicitly requires fresh runtime or portal state.
- Prefer the task-shaped public contract first:
  - `ldev ai bootstrap --intent=discover --cache=60 --json` for read-only discovery
  - `ldev ai bootstrap --intent=develop --cache=60 --json` before code/resource changes
  - `ldev ai bootstrap --intent=deploy --json` before deploy verification
  - `ldev context --json`
  - `ldev portal check --json`
  - `ldev portal inventory ... --json`
  - `ldev logs diagnose --json` for runtime/deploy diagnosis
  - `ldev doctor --json` when runtime or tool readiness matters
  - `ldev mcp check --json` when MCP is part of the plan

## Project-Specific Knowledge

Keep project-owned knowledge outside vendor-managed files.

Recommended locations:

- `docs/ai/project-context.md`
- `.agents/skills/project-*`
- repository docs that describe team-specific architecture or workflows

If `.agents/skills/project-issue-engineering/` exists and the task is driven by
code/resource/runtime mutation, read that skill for non-trivial repository
process after bootstrap: bug fixes, features, migrations, or anything with
reproduction risk. For clearly trivial ad-hoc requests where the developer has
explicitly scoped the exact change, confirm whether they want the full issue
workflow or prefer to proceed directly. Use vendor skills for the technical
execution itself.

## Installed Skills

Use these as the standard reusable entrypoints:

- `liferay-expert`
- `clarifying-liferay-tasks`: pre-implementation grilling skill; use first when the request is ambiguous about Site, Page, resource, module, or owning surface.
- `developing-liferay`
- `isolating-worktrees`
- `deploying-liferay`
- `troubleshooting-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`
- `capturing-session-knowledge`: end-of-session knowledge distillation to `docs/ai/project-learnings.md`.
<!-- Replaced at install time by ldev ai install. Do not edit. -->
{{LIFECYCLE_SKILLS_SECTION}}

## Validation

After installing or updating vendor AI assets:

1. Review `.workspace-rules/ldev-*.md`.
2. Review the tool-specific generated files under `.claude/`, `.cursor/`,
   `.gemini/`, `.github/`, and `.windsurf/`.
3. Keep official Liferay Workspace files intact.
4. Treat `ldev` as augmentation, not replacement, for the Workspace AI layer.
