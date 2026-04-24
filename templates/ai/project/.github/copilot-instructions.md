# Copilot Instructions

This project uses `ldev` to manage a Liferay portal environment.
Installed by `ldev ai install`. Read `AGENTS.md` first for the full operating contract.

## Read First

1. `AGENTS.md` — bootstrap, safety invariants, and installed skills.
2. `docs/ai/project-context.md` if it exists — long-form project knowledge.
3. `docs/ai/project-learnings.md` if it exists — captured session learnings.
4. Task-specific skill under `.agents/skills/` if one applies.

## Bootstrap

Before changing code or runtime state:

1. Run `ldev context --json` — resolves `env.portalUrl`, `paths.*`, `liferay.oauth2Configured`, `commands.*`.
2. Run `ldev doctor --json` — only when the task depends on runtime health, installed tools, or deploy verification.
3. Run `ldev mcp check --json` — only when the task depends on MCP or no direct `ldev` command covers the required portal surface.

Use `ldev --help` as the source of truth for the public CLI surface.

## ldev Command Resolution

1. Try `ldev` directly.
2. If `ldev` is not in PATH: `npx @mordonezdev/ldev ...`
3. Windows PowerShell fallback: `npx.cmd @mordonezdev/ldev ...`

## Task Routing

**Any task that changes code, resources, or runtime state (GitHub issue, chat request, or ad-hoc request):**
Read `.agents/skills/project-issue-engineering/SKILL.md` **before doing anything else**.
It defines the project issue workflow: intake → technical routing → validation → PR.
If the repository has `ldev-native` capabilities available, follow its isolated worktree guidance as a mandatory gate before mutating runtime state.

**Liferay technical execution after issue workflow intake/reproduction gates:**
Use `.agents/skills/liferay-expert/SKILL.md` to route to the right specialist skill.

## Installed Skills

| Skill | Use When |
|---|---|
| `liferay-expert` | Technical Liferay work — routes to the right specialist |
| `developing-liferay` | Code, themes, structured content, fragments |
| `deploying-liferay` | Build, deploy, runtime verification |
| `troubleshooting-liferay` | Diagnosis and recovery |
| `migrating-journal-structures` | Safe Journal structure migration |
| `automating-browser-tests` | Playwright, visual evidence, page-editor workflows |
| `capturing-session-knowledge` | End-of-session knowledge capture to `docs/ai/project-learnings.md` |

Each skill has a `SKILL.md` under `.agents/skills/<name>/`. Read it before starting the task.

## Common Discovery Commands

```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
ldev portal inventory page --url <fullUrl> --json
ldev portal inventory structures --site /<site> --json
ldev portal inventory templates --site /<site> --json
ldev resource export-structure --site /<site> --key <key>
ldev resource export-template --site /<site> --id <id>
ldev logs diagnose --since 5m --json
```

## Isolated Worktree

If the task changes tracked files, use an isolated worktree:

```bash
ldev worktree setup --name <name> --with-env
cd .worktrees/<name>
git rev-parse --show-toplevel
git status --short
ldev start
```

Before any file edit, confirm the target path is under the worktree root returned by
`git rev-parse --show-toplevel`. Do not write changes into the primary checkout.
Re-confirm the worktree root after any interruption, context resume, or shell change.

## Active Worktree Lock

When a user starts from an existing worktree/branch, keep that worktree as the active lock for the full conversation.

1. Do not switch to a different worktree or branch unless the user explicitly requests the switch.
2. Resolve and store one explicit `lockedRoot` at bootstrap from the current editor file path and terminal CWD.
3. If editor file path and terminal CWD point to different roots, stop and ask the user which root to lock before running any command.
4. Before edits, discovery, deploys, imports, or validation, run commands from that locked root only.
5. Use a shell-native directory change when enforcing the lock (`cd` in sh/bash/zsh/fish on Linux/macOS, `Set-Location` in PowerShell on Windows).
6. If command history or previous notes mention another worktree, do not follow it automatically; ask the user first.
7. Do not claim success from another runtime context; evidence must come from the active locked worktree runtime.


## Safety Rules

1. Always start with `ldev context --json`. Use `commands.*` to verify readiness before running any command.
2. Use `--json` output for all automation. Never parse human-readable ldev text.
3. Run `--check-only` before any resource mutation (`import-structure`, `import-template`, `import-adt`, `import-fragment`).
4. Use the smallest deploy or import that proves the change. Never broad-deploy as a default validation step.
5. Never use plural resource commands (`import-structures`, `export-templates`, etc.) without explicit human approval.
6. After any mutation, verify with `ldev portal inventory ...` or `ldev logs diagnose --since 5m --json`.
7. Never guess IDs, keys, or site names — use `ldev portal inventory ...` to resolve them.
8. Never assume the portal URL — read `env.portalUrl` from `ldev context --json`.
9. Never use `git worktree add` directly — use `ldev worktree setup --name <name> --with-env`.
10. If a command fails, diagnose first (`ldev logs diagnose --json` or `ldev doctor --json`) before retrying.
11. For `ldev-native`, any task that mutates code/resources/runtime must execute this gate order without exceptions: `Red-1` reproduction in current runtime → isolated worktree setup and root lock → `Red-2` reproduction in worktree runtime → import/deploy verification with runtime evidence → `Red -> Green` visual validation.
12. These are invalid reasons to skip the mandatory gate order: no formal GitHub issue, task is small, already on a feature branch, runtime already running, or user did not explicitly ask for validation/worktree steps.
