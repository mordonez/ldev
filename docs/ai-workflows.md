# AI Workflows

`ldev` is designed to be a safe, reliable CLI surface for coding agents working in Liferay repositories.

> Looking for installation and prompt examples? See [AI Skills](/skills).

## Product stance

`ldev` is not trying to replace the official Liferay AI direction.

The intended layering is:

1. **Liferay Workspace** as the standard project structure.
2. **Liferay MCP** as an official protocol surface for agent interoperability.
3. **`ldev`** as the high-level workflow CLI for humans and agents.

Why this matters:

- agents usually perform better when given a short, stable path with well-designed outputs
- a direct command such as `ldev portal inventory page --url /web/guest/home --json` is often more efficient than asking an agent to discover the right OpenAPI, call several low-level endpoints, interpret the responses, and infer the next step

This is not a claim that MCP is bad. It is a claim about interface design.

`ldev` should therefore remain disciplined:

- keep the command set focused
- prefer a small number of high-value commands
- keep JSON outputs stable — see [Automation](/automation) for the full machine-readable output contract
- use clear naming
- design commands that chain well in agent sessions

See also: [MCP Strategy](/mcp-strategy) · [Automation](/automation).

## Recommended agent entrypoint

Start sessions with:

```bash
ldev doctor --json
ldev context --json
```

- `doctor --json` gives a structured pass/fail prerequisite report.
- `context --json` returns repo paths, portal URL, auth state, available namespaces, and worktree info.

This avoids ad-hoc environment probing and gives agents a stable contract before making changes.

For many tasks this is the intended flow:

1. run `ldev doctor --json`
2. run `ldev context --json`
3. run one task-shaped command such as:
   - `ldev portal inventory sites --json`
   - `ldev portal inventory page --url /web/guest/home --json`
   - `ldev resource export-structures --site /my-site --json`
4. act on the returned context

The goal is to reduce guesswork and tool-hopping early in the session.

## MCP usage guidance

Use this rule:

- use `ldev` first for runtime context, diagnosis, OAuth, and opinionated portal discovery
- use MCP when generic OpenAPI discovery or generic endpoint execution is the shortest path

Recommended sequence:

```bash
ldev doctor --json
ldev context --json
ldev mcp check --json
```

Then:

- prefer `ldev portal inventory ... --json` for sites, page trees, and page inspection
- prefer MCP for generic OpenAPI discovery and generic portal calls when MCP is healthy
- for agents and reusable skills, prefer MCP authenticated through `ldev`-managed OAuth2 instead of a human username/password

When MCP auth is the issue rather than runtime health, check the installed OAuth2
scope profile in [OAuth2 Scopes](/oauth-scopes).

See [MCP Strategy](/mcp-strategy) for the decision matrix.
For a reproducible wider-scope demo setup, see [MCP Demo Environment](/mcp-demo).

## Agentic command roles

`ldev` now distinguishes between support level and agentic value. A command can be fully supported without being part of the preferred agent-facing contract.

### Agent-core

These are the commands agents should reach for first:

- `ldev doctor --json`
- `ldev context --json`
- `ldev status --json`
- `ldev portal check --json`
- `ldev portal audit --json`
- `ldev portal inventory ... --json`
- `ldev logs diagnose --json`
- `ldev oauth install --json`
- `ldev mcp check --json`

These commands justify existing because they usually avoid several lower-level steps, return stable machine-readable output, and encode local operational knowledge that raw APIs or MCP do not provide directly.

### Runtime-core

These commands are essential for lifecycle orchestration, but they are not where the main agentic differentiation lives:

- `setup`
- `start`
- `stop`
- `logs`
- `deploy`
- `db`
- `env`
- `worktree`
- `osgi`

### Specialized

These remain valuable because they encode non-trivial Liferay knowledge, but they are narrower than the core contract:

- `resource ...`
- `portal search ...`
- `portal reindex ...`
- `portal page-layout ...`
- `portal config ...`
- `portal theme-check`
- `mcp probe`
- `mcp openapis`

### Human-only or hidden

Some commands remain useful but should not be part of the public agent contract:

- `shell`
- `deploy watch`
- interactive `osgi gogo`
- hidden maintainer commands such as `health`, `perf`, `snapshot`, `restore`

## Install reusable agent skills

```bash
ldev ai install --target .
ldev ai install --target . --project
ldev ai update --target .
ldev ai install --target . --skill liferay-expert --skill developing-liferay
ldev ai update --target . --skill liferay-expert
```

- `ai install` installs vendor-managed skills plus `AGENTS.md` bootstrap context.
- `ai install --project-context` also installs `docs/ai/project-context.md` and its sample.
- `--project` also installs project-owned skill scaffolding, but only the subset that makes sense for the detected project type/runtime.
- `--project` emits warnings when a richer project overlay is intentionally skipped because the detected runtime does not provide the required capabilities.
- `ai update` refreshes vendor skills to the CLI-supported version.

Installed workflows include routing, development, deployment, troubleshooting, structure migration, and browser-test automation patterns.

Installed vendor skills include:

- `liferay-expert` (routing)
- `developing-liferay`
- `deploying-liferay`
- `troubleshooting-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`

`AGENTS.md` is the standard agent entrypoint and guides agents to run `ldev doctor` and `ldev context --json` first.
`docs/ai/project-context.md` is optional project-owned context, not part of the default bootstrap.

When updating skills:

- vendor-managed skills are updated by `ldev ai update`
- project-owned skills installed with `--project` are not overwritten

In standard Liferay Workspaces, the official AI rule files created by the workspace should be treated as the base layer. `ldev` should complement those rules with workflow-specific guidance, not replace them.

When both layers are present, treat `ldev`-managed MCP guidance as the verified runtime-specific layer. This is especially important if the official Workspace files still describe older MCP assumptions.

In `ldev-native`, that same shared Liferay knowledge should still be present, but adapted to the native runtime model instead of copied as raw Blade-specific setup instructions.


## Skill catalog (vendor and project)

### Vendor-managed skills (`ldev ai install`)

| Skill | Main function | Why it is useful |
| --- | --- | --- |
| `liferay-expert` | Router skill for technical Liferay tasks. | Chooses the right specialized workflow quickly when task type is still unclear. |
| `developing-liferay` | Implementation workflow for code, themes, fragments, and structured resources. | Standardizes discovery + implementation steps and reduces ad-hoc commands. |
| `deploying-liferay` | Build/deploy/verify workflow after a change is implemented. | Keeps deploy scope minimal and makes runtime verification repeatable. |
| `troubleshooting-liferay` | Diagnosis-first runtime troubleshooting flow. | Improves recovery speed with structured checks (`doctor/context/status`). |
| `migrating-journal-structures` | Controlled workflow for high-risk structure/content migrations. | Makes schema evolution safer with staged validation instead of one-off scripts. |
| `automating-browser-tests` | Playwright-based browser validation and evidence capture workflow. | Connects portal discovery (`ldev`) with reproducible UI checks in automated sessions. |

### Project-owned skills (`ldev ai install --project`)

| Skill | Main function | Why it is useful |
| --- | --- | --- |
| `issue-engineering` | End-to-end issue resolution lifecycle (intake, isolated worktree, validation, PR, cleanup). | Gives a single guardrailed path for issue execution across developers and agents. |
| `capturing-session-knowledge` | Persist validated session learnings into project docs/skills. | Prevents knowledge loss and turns one-off fixes into reusable project context. |

Project-owned skills are intentionally local to the repository: they encode team process and domain specifics that should not be overwritten by vendor updates.

They are not universal. A project-owned workflow that depends on `ldev worktree` or another native-only capability should not be installed into `blade-workspace` just because `--project` was used.

## Branch-scoped agent environments

Use worktrees for isolated AI runs:

```bash
ldev worktree setup --name task-123 --with-env
cd .worktrees/task-123
ldev start
```

Each worktree receives separate runtime state, so agent tasks do not interfere with a developer's main environment.

## Related docs

- [Key Capabilities](/capabilities)
- [Worktree Environments](/worktree-environments)
- [Automation Contract](/automation)
- [Command Reference](/commands)
