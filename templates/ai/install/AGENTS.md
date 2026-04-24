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
3. Run `ldev mcp check --json` only when the task depends on MCP or no direct
   `ldev` command covers the required portal surface.
4. Read `CLAUDE.md`.
5. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Safety Invariants

These rules apply to every task, regardless of the skill in use:

1. Always start with `ldev ai bootstrap --intent=develop --cache=60 --json`. Use `context.commands.*` and `doctor.readiness.*` to verify readiness before running any command.
2. Always consume `--json` output. Never parse human-readable text output from `ldev`.
3. Always run `--check-only` before any resource mutation (`import-structure`, `import-template`, `import-adt`, `import-fragment`, `migration-pipeline`).
4. Always use the smallest deploy or import that proves the change. Never broad-deploy as a default validation step.
5. Never use plural resource commands (`import-structures`, `export-templates`, etc.) or broad deploys without explicit human approval.
6. After any mutation, verify with operation-specific evidence:
  - Resource imports (`import-structure`, `import-template`, `import-adt`, `import-fragment`): read back the updated resource with `ldev resource get-*` / `ldev resource export-*` / `ldev portal inventory ... --json`.
  - Deploy/runtime changes (modules, themes, startup/runtime faults): use `ldev logs diagnose --since 5m --json`.
7. When the change affects rendered pages or UI, verify with browser automation after the runtime settles.
8. If a command fails, diagnose first (`ldev logs diagnose --json` or `ldev doctor --json`) before retrying.
9. Never guess IDs, keys, or site names. Use `ldev portal inventory ...` to resolve them.
10. Never assume the portal URL. Read `context.liferay.portalUrl` from bootstrap output.

## ldev Command Resolution

When instructions say `ldev ...`, resolve the CLI in this order:

1. Try `ldev` directly.
2. If `ldev` is not available in `PATH`, run `npx @mordonezdev/ldev ...`.
3. On Windows PowerShell, if `npx` is blocked by script execution policy, use
   `npx.cmd @mordonezdev/ldev ...`.

For agent work, treat `npx.cmd @mordonezdev/ldev` as the Windows-safe fallback.
Do not stop on `CommandNotFound` for `ldev` until this fallback has been tried.

## Default Operating Rules

- Use `ldev` as the official entrypoint. Do not fall back to legacy wrappers or
  ad hoc project scripts when an `ldev` command already exists.
- Before using a `git`, `blade`, or ad hoc shell command to accomplish something,
  check `ldev --help` to verify no `ldev` equivalent exists.
- Never use `git worktree add` directly. Use `ldev worktree setup --name <name> --with-env`
  instead — it handles environment isolation, database copying, and Btrfs snapshots
  on top of the git worktree. `git worktree add` alone is incomplete and unsafe for
  this workflow.
- After creating an isolated worktree, immediately `cd` into it and confirm the
  editing root with `git rev-parse --show-toplevel`. Do not edit files whose
  absolute path belongs to the primary checkout when the task requires a
  worktree.
- Treat the confirmed worktree root as an edit boundary, not a one-time check.
  Before any file edit, make sure the tool `workdir` and every target path are
  under that root. Re-run the check after interruptions, context resumes, shell
  changes, or any step that may have changed directories.
- Prefer the task-shaped public contract first:
  - `ldev ai bootstrap --intent=discover --json` for read-only discovery
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
- Do not switch to another worktree, checkout another branch, or run commands from another repo root unless the user explicitly asks for that switch in the current chat.
- Resolve and store one explicit `lockedRoot` at bootstrap from the current editor file path and terminal CWD.
- If editor file path and terminal CWD point to different roots, stop and ask for explicit user confirmation before running any command.
- Prefix command sequences with an explicit shell-native directory change to the locked worktree root before running discovery, validation, import, deploy, or mutating commands that generate evidence (`cd` in sh/bash/zsh/fish on Linux/macOS, `Set-Location` in PowerShell on Windows).
- Before reporting any import/deploy/edit as successful, verify in the same locked worktree runtime context (`ldev status --json` and read-after-write evidence).
- If context appears to point at a different worktree than the locked one, stop and ask for confirmation instead of continuing.

## MCP Usage

- Treat MCP as optional. Do not assume it is enabled in every runtime.
- Run `ldev mcp check --json` before planning around MCP, not as universal bootstrap.
- For agents and reusable skills, prefer OAuth2 via `ldev oauth install --write-env` instead of MCP Basic auth with a human username/password.
- Treat MCP username/password auth as a quick manual test path, not as the default agent bootstrap.
- If MCP is available and the task is generic OpenAPI discovery or generic endpoint execution, MCP can be the shortest path.
- If the task is local-runtime diagnosis or opinionated portal discovery, prefer `ldev` commands first.

Use MCP for:

- discovering available OpenAPIs
- retrieving one OpenAPI spec
- calling a generic portal endpoint when no higher-level `ldev` command exists

Prefer `ldev` for:

- runtime diagnosis
- OAuth/bootstrap
- site and page discovery
- page inspection and other task-shaped workflows

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
- `deploying-liferay`: build, deploy and runtime verification flow.
- `troubleshooting-liferay`: diagnosis and recovery flow.
- `migrating-journal-structures`: safe Journal migration playbook.
- `automating-browser-tests`: Playwright browser checks, visual evidence and page-editor workflows.
- `capturing-session-knowledge`: end-of-session knowledge distillation to `docs/ai/project-learnings.md`.
{{LIFECYCLE_SKILLS_SECTION}}

## Validation

After installing or updating vendor skills:

1. Review `.agents/skills/`.
2. Update `CLAUDE.md` and add `docs/ai/project-context.md` only if the project will maintain it.
3. Add any project-owned skills with the `project-` prefix.
