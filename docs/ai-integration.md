# AI Integration

`ldev` provides a structured way to integrate reusable AI skills and agent workflows into your Liferay projects.

## Quick Start

Install vendor-managed skills:

```bash
ldev ai install --target .
```

Install with project overlays (optional):

```bash
ldev ai install --target . --project --project-context
```

Start an agent session with:

```bash
ldev doctor --json
ldev context --json
```

---

## Product Stance

`ldev` is designed as a high-level workflow CLI for both humans and coding agents. It is not trying to replace the official Liferay Workspace or Liferay MCP, but to complement them:

1. **Liferay Workspace** — standard project structure
2. **Liferay MCP** — official protocol for generic portal interoperability
3. **`ldev`** — high-level workflow CLI with task-shaped commands

Why this matters: agents perform better with short, stable paths and well-designed outputs. `ldev portal inventory page --url /web/guest/home --json` is often more efficient than asking an agent to discover OpenAPI, call low-level endpoints, interpret responses, and infer the next step.

---

## Installation & Management

### Install commands

- `ldev ai install --target .` — Install vendor skills + AGENTS.md
- `ldev ai install --target . --project` — Also install project-owned overlays
- `ldev ai install --target . --project-context` — Also install docs/ai/project-context.md
- `ldev ai update --target .` — Refresh vendor skills to latest version

### What gets installed

- `.agents/skills/<name>/SKILL.md` — Vendor-managed skills
- `.agents/.vendor-skills` — Manifest of installed vendor skills
- `AGENTS.md` — Agent bootstrap entrypoint
- `CLAUDE.md` — Project context (in ldev-native)
- Optional: `docs/ai/project-context.md` — Project-specific AI guidance
- Optional: `.agents/skills/project-*` — Project-owned skills

In **Blade Workspace**: Also installs `ldev-*` rule files in `.workspace-rules/` and mirrors them to `.claude/rules/`, `.cursor/rules/`, `.gemini/`, etc.

---

## Using AI Skills in Prompts

Use explicit skill routing for more reliable agent outcomes:

### 1) Routing

```text
Use liferay-expert.
Task: "I need to export a structure, review dependencies, and prepare a safe import into another environment."
```

### 2) Development

```text
Use developing-liferay.
Task: "Implement a fragment + ADT and return a plan with ldev commands and validation criteria."
```

### 3) Deployment

```text
Use deploying-liferay.
Task: "Build and deploy the current change, verify OSGi state, and provide a rollback plan if it fails."
```

### 4) Troubleshooting

```text
Use troubleshooting-liferay.
Task: "Portal is not starting: run a layered diagnosis and prioritize recovery actions."
```

### 5) Structure Migration

```text
Use migrating-journal-structures.
Task: "Prepare a safe migration plan for moving content from v1 to v2 schema."
```

### 6) Browser Testing

```text
Use automating-browser-tests.
Task: "Navigate to the page editor, validate rendering, and generate visual evidence."
```

---

## Agent Workflows

### Recommended entrypoint

Start agent sessions with:

```bash
ldev doctor --json          # Host/environment validation
ldev context --json         # Repo snapshot: paths, portal URL, auth, namespaces
ldev mcp check --json       # MCP health (if using MCP)
```

Then proceed with task-shaped commands:

```bash
ldev portal inventory sites --json
ldev portal inventory page --url /web/guest/home --json
ldev resource export-structures --site /my-site --json
```

### MCP + ldev coordination

- Use `ldev` first for runtime context, diagnosis, OAuth, and opinionated portal discovery
- Use MCP for generic OpenAPI discovery or generic endpoint execution when it's the shortest path

Command layers:

| Layer | Best For |
|-------|----------|
| `ldev` | Doctor, context, portal inventory, resource exports, deployment, troubleshooting |
| MCP | Generic endpoint discovery, generic portal API calls, interop with other tools |
| Direct Headless | When you have a specific, stable endpoint in mind |

### Agent-core commands

These should be the first reach for agents:

- `ldev doctor --json` — Prerequisite validation
- `ldev context --json` — Environment snapshot
- `ldev status --json` — Runtime state
- `ldev portal check --json` — Portal health
- `ldev portal inventory ... --json` — Sites, pages, structures, etc.
- `ldev logs diagnose --json` — Runtime diagnostics
- `ldev oauth install --json` — OAuth setup
- `ldev mcp check --json` — MCP health

---

## Skill Catalog

### Vendor-managed (always available)

| Skill | Purpose |
|-------|---------|
| `liferay-expert` | Router skill for technical Liferay tasks |
| `developing-liferay` | Implementation workflow (code, themes, fragments) |
| `deploying-liferay` | Build/deploy/verify workflow |
| `troubleshooting-liferay` | Diagnosis-first runtime troubleshooting |
| `migrating-journal-structures` | Safe schema evolution workflows |
| `automating-browser-tests` | Playwright-based UI validation |

### Project-owned (optional, with `--project`)

| Skill | Purpose |
|-------|---------|
| `issue-engineering` | End-to-end issue lifecycle (intake → PR → cleanup) |
| `capturing-session-knowledge` | Persist learnings into project docs |

Project-owned skills are local to the repo and encode team process. They are not overwritten by vendor updates.

---

## Isolated Agent Environments (Worktrees)

Run agent tasks in isolated branch environments:

```bash
ldev worktree setup --name task-123 --with-env
cd .worktrees/task-123
ldev doctor --json
ldev context --json
# Agent runs here with separate runtime state
ldev worktree clean --force --delete-branch
```

Each worktree has separate Docker data, so agent tasks don't interfere with your main environment.

---

## Best Practices

1. **Start sessions with doctor + context**: Gives agents a stable snapshot before making changes
2. **Keep vendor and project knowledge separated**: Vendor in `.agents/.vendor-skills`, project-specific in `docs/ai/project-context.md`
3. **In Blade Workspace**: Preserve official Liferay AI files as base layer; treat `ldev` as workflow augmentation
4. **In ldev-native**: Use ldev-specific capabilities like worktrees for agent isolation
5. **Incremental adoption**: Start with a small set of skills, expand once workflow is stable

---

## See Also

- [Commands Reference](/commands) — Full CLI reference
- [Worktree Environments](/worktree-environments) — Isolated branch testing
- [Automation](/automation) — Machine-readable output contract
- [Key Capabilities](/capabilities) — Overview of ldev capabilities
