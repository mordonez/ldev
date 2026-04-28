---

description: High-level `ldev` workflow guidance for humans and agents in an ldev-native project
globs: *
alwaysApply: true

---

# `ldev` Agent Workflow

- Treat `AGENTS.md` as the bootstrap entrypoint.
- `ldev` owns the full runtime contract in this project type.
- If `.agents/skills/project-issue-engineering/SKILL.md` exists and the task
  mutates code, resources, or runtime state, run that workflow first for non-trivial
  work (bugs, features, migrations). For clearly trivial ad-hoc requests, confirm
  with the developer whether to follow the full intake or proceed directly.
- For non-trivial mutating tasks, the recommended default gate order is:
  `Red-1` reproduction → worktree isolation/root lock → `Red-2` reproduction →
  import/deploy verification → `Red → Green` visual validation.
  For clearly trivial changes, assess the scope and ask the developer whether they
  want the full workflow or prefer to work directly in the current checkout.
- When isolation needs a runtime-backed worktree, ask the user whether the main environment needs to run in parallel. Default is `ldev worktree setup --name <worktree-name> --with-env --stop-main-for-clone` (main stays stopped to conserve resources). Add `--restart-main-after-clone` only if the user confirms they need main running alongside the worktree.

Preferred task-shaped entry points after bootstrap:

- `ldev ai bootstrap --intent=discover --cache=60 --json`
- `ldev ai bootstrap --intent=develop --cache=60 --json`
- `ldev ai bootstrap --intent=deploy --json`
- `ldev context --json`
- `ldev status --json`
- `ldev portal inventory sites --json`
- `ldev portal inventory pages --site /my-site --json`
- `ldev portal inventory page --url /web/guest/home --json`
- `ldev resource export-structure --site /my-site --structure <key> --json`
- `ldev resource export-template --site /my-site --template <id> --json`
- `ldev resource import-structure --site /my-site --structure <key> --check-only`
- `ldev deploy module <module-name> --format json`
- `ldev deploy theme --format json`

Run `ldev doctor --json` only when you need diagnosis beyond the bootstrap
readiness result. Run
`ldev mcp check --json` only when the task depends on MCP or when no direct
`ldev` command covers the required portal surface.

Prefer `ldev` commands over raw Docker or shell equivalents. Use MCP only when it provides something a direct `ldev` command does not already cover.

Prefer atomic commands. Do not use plural resource commands or a broad deploy
unless a human explicitly asks for a bulk operation and the risk is written down
first.

When an issue starts from one or more URLs, do not reproduce or validate against
the production host. Resolve every mentioned page through
`ldev portal inventory page --url`, switch to the local runtime URL, and inspect
those pages before searching code. Treat that inspection as the default first
context-gathering step whenever a relevant URL is available.
Use page inspection to identify the concrete ADT, template, fragment, module,
or theme surface first; broad grep comes after that.

Deploy commands are only for deployable artifacts. Use `ldev deploy theme`
when the theme changed, and `ldev deploy module <module-name>` when modules or
deployable Gradle units changed. For Journal templates, ADTs, fragments, and
structures, use the runtime resource import workflow and validate the affected
page with `playwright-cli`. If source config or properties changed, restart the
environment before validation.

Hard rule after edits:

- `modules/` changed -> `ldev deploy module <module-name>`
- theme source changed -> `ldev deploy theme`
- structure changed -> `ldev resource import-structure --site /<site> --structure <STRUCTURE_KEY>`
- ADT changed -> `ldev resource import-adt --site /<site> --file <path/to/adt.ftl>`
- template changed -> `ldev resource import-template --site /<site> --template <TEMPLATE_ID>`
- fragment changed -> `ldev resource import-fragment --site /<site> --fragment <fragment-key>`
- properties or source config changed -> `ldev env restart`

Do not say the fix is applied just because files were edited. The matching
deploy, import, or restart step is part of the fix.

Before creating an isolated worktree, verify the current branch. If the primary
checkout is not on `main`, pass the intended `--base <ref>` explicitly instead
of letting the worktree branch from a feature branch by accident.

After creating a worktree, immediately enter it and prove the editing root
before touching files:

```bash
cd .worktrees/<name>
pwd
git rev-parse --show-toplevel
git status --short
```

Creating the worktree does not mean later tool writes are automatically scoped
to it. Before the first edit, confirm every file path you will edit starts with
the worktree root. If a path points at the primary checkout, stop and correct the
working directory before writing.

Keep that boundary active for the whole task. After any interruption, context
resume, shell change, terminal tab change, or command that may have changed the
current directory, re-run the root check before editing. For editor or agent
tools that accept a `workdir`, set it to the confirmed worktree root or a
subdirectory under it; do not rely on a previous terminal prompt.

If you are inside a worktree and need read-only discovery against the main
runtime, do not change directories just for that. Prefix the command with
`ldev --repo-root <main-root>` instead.
