# ADR 0009 — Remove `ldev ai install`

- **Status:** Accepted
- **Date:** 2026-06-19
- **Relates to:** [ADR 0008](./0008-remove-mcp-server.md)

`ldev ai install` — which copied static agent files (AGENTS.md, CLAUDE.md, Copilot and Gemini instructions, and skills) into a user project — has been removed. Skills are now obtained by copying them manually or via `npx skills add https://github.com/mordonez/ldev`. `ldev ai bootstrap` is retained as the runtime context generator; it is genuinely irreplaceable by a static file.

## Context

`ldev ai install` delivered a set of static agent meta-files into a target project directory. The idea was that versioned, automated delivery would keep these files up to date as `ldev` evolved. In practice, the command had zero active users and the install workflow did not fit cleanly into the CLI+skills model established by ADR 0008: it is a one-time project-setup operation, not part of the operational loop (understand → diagnose → fix → verify).

The maintenance surface was disproportionate: four source files (`ai-install.ts`, `ai-install-fs.ts`, `ai-install-project.ts`, `ai-manifest.ts`), a re-export shim in `core/`, unit tests, and command registration — all to copy files a developer can copy manually in seconds.

## Decision

Remove the install command and its supporting modules. The template files in `templates/ai/install/` (AGENTS.md, AGENTS.workspace.md) move to `docs/ai/` as copy-paste reference material with README setup instructions. Skills under `templates/ai/project/skills/` remain the primary agent integration surface and are distributed via `npx skills add`.

The canonical skill path in projects is `.agents/skills/<skill-name>/SKILL.md`. The README documents how to reach it — by copying manually or via `npx skills add`, which creates symlinks from `.claude/skills/` into `.agents/skills/`. Projects that lack `.claude/` must create it before running `npx skills add` so that Claude Code symlinks are not silently skipped.

## Considered alternatives

**Keep install, make it opt-in.** Rejected. Opt-in adds complexity without resolving the zero-users problem. The value of automated delivery only materialises when users repeatedly reinstall to pick up updates — a workflow with no evidence of adoption.

**Move install to a separate package.** Rejected. The maintenance cost follows the code, not its location.

## Consequences

- `src/features/ai/ai-install*.ts`, `src/features/ai/ai-manifest.ts`, and `src/core/runtime/ai-manifest.ts` are deleted.
- `ldev ai` retains only the `bootstrap` subcommand.
- `templates/ai/install/` content moves to `docs/ai/` with setup instructions.
- ADR 0008's reference to "skills installed by `ldev ai install`" is superseded by this ADR.
