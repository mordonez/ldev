# AGENTS

Standard entrypoint for coding agents working in a project that uses `ldev`.

This file is intentionally small. It defines the stable bootstrap, the default
operating rules, and where to find deeper task playbooks.

Project-specific context lives outside this file:

- `CLAUDE.md` routes Claude to project-owned context docs.
- `docs/ai/project-context.md` is the optional long-form project knowledge document.

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev ai bootstrap --intent=develop --cache=60 --json`.
2. Run `ldev doctor --json` only when the task needs extra runtime health,
   installed tooling, browser automation, deploy verification, or diagnosis.
3. Use local `ldev` MCP tools for structured discovery/diagnosis when they are
   visible in the active assistant. If they are not visible, continue with the
   CLI fallback commands in this file; do not block the task.
4. Read `CLAUDE.md`.
5. Read the task-specific skill under `.agents/skills/` if one applies.
6. If `.agents/skills/project-issue-engineering/SKILL.md` exists and the task
   mutates code, resources, or runtime state, read it first for non-trivial work
   such as bug fixes, features, migrations, or anything with reproduction risk.
   For clearly trivial ad-hoc requests where the developer has explicitly scoped
   the exact change, confirm whether they want the full issue workflow or prefer
   to proceed directly.

Use `ldev --help` as the source of truth for the public CLI surface.

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
11. For `ldev-native`, the recommended default for any task that mutates code/resources/runtime is: `Red-1` reproduction in current runtime → isolated worktree setup and root lock → `Red-2` reproduction in worktree runtime → import/deploy verification with runtime evidence → `Red → Green` visual validation. Before imposing the full gate sequence, briefly assess the task scope: for bug fixes, migrations, and significant feature work, apply the full gate. For clearly trivial changes (single-field config update, copy fix, isolated template tweak the developer explicitly scoped), ask the developer whether they want the full isolation workflow or prefer to proceed in the current checkout.
12. Safety checks that apply to every task regardless of scope: `--check-only` before any resource import, read-after-write verification after mutations, ID and URL resolution via `ldev portal inventory` (never guess), and diagnosis before speculative fixes. These are not negotiable. Workflow steps (worktree isolation, Red-1/Red-2 cycle, browser validation) are the recommended default; for clearly trivial tasks, confirm with the developer before imposing them.

## ldev Command Resolution

When instructions say `ldev ...`, resolve the CLI in this order:

1. Try `ldev` directly.
2. If `ldev` is not available in `PATH`, run `npx @mordonezdev/ldev ...`.
3. On Windows PowerShell, if `npx` is blocked by script execution policy, use
   `npx.cmd @mordonezdev/ldev ...`.

For agent work, treat `npx.cmd @mordonezdev/ldev` as the Windows-safe fallback.
Do not stop on `CommandNotFound` for `ldev` until this fallback has been tried.

## Optional Shell Helpers

- `jq` is not installed by default on every machine. Check with `jq --version`.
- Install when needed:
  - Windows: `winget install jqlang.jq`
  - macOS: `brew install jq`
  - Linux (Debian/Ubuntu): `sudo apt install jq`
- In reusable agent docs, prefer direct JSON parsing by the agent or shell-native
  parsing (`ConvertFrom-Json` in PowerShell) instead of assuming `jq` exists.

## Default Operating Rules

- Use `ldev` as the official entrypoint. Do not fall back to legacy wrappers or
  ad hoc project scripts when an `ldev` command already exists.
- Before using a `git`, `blade`, or ad hoc shell command to accomplish something,
  check `ldev --help` to verify no `ldev` equivalent exists.
- If an `ldev-native` task needs isolated runtime state or a confirmed edit
  boundary, use `isolating-worktrees` for the canonical setup, recovery, and
  cleanup flow. For runtime-backed worktrees, ask the user whether main needs to run in parallel with the worktree. Default: `ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone` (main stays stopped). Add `--restart-main-after-clone` only if the user confirms they need main running alongside.
- Never use `git worktree add` directly. `git worktree add` alone is incomplete
  and unsafe for this workflow.
- After creating an isolated worktree, confirm the editing root with
  `git rev-parse --show-toplevel` and treat that root as an active edit
  boundary for the whole task.
- Use `--cache=60` for read-only bootstrap intents. Omit it only when the task
  explicitly requires fresh runtime or portal state.
- Prefer the task-shaped public contract first. If the equivalent local `ldev`
  MCP tool is visible, use it for structured discovery/diagnosis; otherwise use
  the CLI fallback:
  - `ldev ai bootstrap --intent=discover --cache=60 --json` for read-only discovery
  - `ldev ai bootstrap --intent=develop --cache=60 --json` before code/resource changes
  - `ldev ai bootstrap --intent=deploy --json` before deploy verification
  - `ldev context --json`
  - `ldev portal check --json`
  - `ldev portal inventory ... --json`
  - `ldev logs diagnose --json` for runtime/deploy diagnosis
  - `ldev doctor --json` when runtime or tool readiness matters
  - `ldev mcp check --json` when MCP is part of the plan
- For scripting and agents, prefer machine-readable output:
  - `ldev ai bootstrap --intent=develop --cache=60 --json`
  - `ldev doctor --json`
  - `ldev context --json`
  - `ldev status --json`


## Branch and Worktree Lock

- Treat the current user-selected worktree as locked for the whole session.
- For detailed setup and recovery, use `isolating-worktrees`. Keep this section
  focused on the always-on lock invariant only.
- Do not switch to another worktree, checkout another branch, or run commands from another repo root unless the user explicitly asks for that switch in the current chat.
- Resolve and store one explicit `lockedRoot` at bootstrap from the current editor file path and terminal CWD.
- If editor file path and terminal CWD point to different roots, stop and ask for explicit user confirmation before running any command.
- Prefix command sequences with an explicit shell-native directory change to the locked worktree root before running discovery, validation, import, deploy, or mutating commands that generate evidence (`cd` in sh/bash/zsh/fish on Linux/macOS, `Set-Location` in PowerShell on Windows).
- Before reporting any import/deploy/edit as successful, verify in the same locked worktree runtime context (`ldev status --json` and read-after-write evidence).
- If context appears to point at a different worktree than the locked one, stop and ask for confirmation instead of continuing.

## MCP Usage

There are two different MCP surfaces:

- **Local ldev MCP server:** optional acceleration layer for agent-facing
  `ldev` workflows.
- **Liferay portal MCP server:** optional portal feature checked by
  `ldev mcp check --json`.

Treat local `ldev` MCP as optional. Do not assume it is enabled in every editor
or assistant. If the tool is visible, prefer it for structured discovery and
diagnosis; if not, use the CLI fallback and continue. `liferay_osgi_thread_dump`
writes dump artifacts, so use it only when runtime artifacts are part of the
diagnosis.

MCP-to-CLI fallbacks:

- `ldev_context` -> `ldev context --json`
- `liferay_check` -> `ldev portal check --json`
- `ldev_status` -> `ldev status --json`
- `ldev_logs_diagnose` -> `ldev logs diagnose --since 10m --json`
- `liferay_inventory_sites` -> `ldev portal inventory sites --json`
- `liferay_inventory_pages` -> `ldev portal inventory pages --site /<site> --json`
- `liferay_inventory_page` -> `ldev portal inventory page --url <url> --json`
- `liferay_inventory_structures` -> `ldev portal inventory structures --site /<site> --json`
- `liferay_inventory_templates` -> `ldev portal inventory templates --site /<site> --json`
- `liferay_deploy_status` -> `ldev deploy status --json`
- `liferay_osgi_status` -> `ldev osgi status <bundle> --json`
- `liferay_osgi_diag` -> `ldev osgi diag <bundle> --json`
- `liferay_osgi_thread_dump` -> `ldev osgi thread-dump --json`
- `liferay_doctor` -> `ldev doctor --json`

When the user reports that MCP tools are missing or stale, run:

```bash
ldev mcp doctor --target . --tool all
```

Keep mutating workflows CLI-first unless a skill explicitly documents a bounded
MCP mutation path. Skills decide the workflow and guardrails; MCP only executes
the structured operation when available.

Use the Liferay portal MCP server for generic OpenAPI discovery or endpoint
execution only when no higher-level `ldev` command covers the portal surface.
For agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env`
instead of MCP Basic auth with a human username/password.

## Project-Specific Knowledge

`ldev` installs reusable skills, not project-specific know-how.

Keep project-owned knowledge in project files, not in vendor-managed skills.

Recommended locations:

- `CLAUDE.md` for Claude-specific routing and instructions
- `docs/ai/project-context.md` for maintainable long-form project context
- extra skills under `.agents/skills/project-*` for project-owned workflows

Read order:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `docs/ai/project-context.md` if it exists
4. `docs/ai/project-learnings.md` if it exists
5. All files under `.workspace-rules/` if that directory exists
6. task-specific skills under `.agents/skills/`

## Installed Skills

Use these as the standard reusable entrypoints when the task needs a deeper playbook:

- `liferay-expert`: router for technical Liferay work.
- `developing-liferay`: implementation guidance for code, themes, content resources and fragments.
- `isolating-worktrees`: isolated `ldev-native` worktree setup, edit-root lock, recovery and cleanup.
- `deploying-liferay`: build, deploy and runtime verification flow.
- `troubleshooting-liferay`: diagnosis and recovery flow.
- `migrating-journal-structures`: safe Journal migration playbook.
- `automating-browser-tests`: Playwright browser checks, visual evidence and page-editor workflows.
- `capturing-session-knowledge`: end-of-session knowledge distillation to `docs/ai/project-learnings.md`.
<!-- Replaced at install time by ldev ai install. Do not edit. -->
{{LIFECYCLE_SKILLS_SECTION}}

## Validation

After installing or updating vendor skills:

1. Review `.agents/skills/`.
2. Update `CLAUDE.md` and add `docs/ai/project-context.md` only if the project will maintain it.
3. Add any project-owned skills with the `project-` prefix.
