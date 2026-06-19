# Agent meta-files for `ldev` projects

Copy these files into your project to give AI coding agents (Claude Code, Copilot, Cursor, Gemini, etc.) the right entrypoint and workflow contract for working with `ldev`.

## Files

| File | Purpose | When to use |
|------|---------|-------------|
| `AGENTS.md` | Agent entrypoint for standard `ldev-native` projects | Copy to your project root |
| `AGENTS.workspace.md` | Agent entrypoint for Liferay Workspace projects | Copy to your project root as `AGENTS.md` |

## Setup

### 1. Copy the agent entrypoint

For a standard (`ldev-native`) project:

```bash
cp <path-to-ldev>/docs/ai/AGENTS.md ./AGENTS.md
```

For a Liferay Workspace project:

```bash
cp <path-to-ldev>/docs/ai/AGENTS.workspace.md ./AGENTS.md
```

Or copy the raw content from this repository.

### 2. Create `.claude/skills/` so Claude Code symlinks work

`npx skills add` silently skips creating Claude Code symlinks when `.claude/` does not exist:

```bash
mkdir -p .claude/skills
```

### 3. Install skills

```bash
npx skills add https://github.com/mordonez/ldev
```

Skills land under `.agents/skills/`. The agent reads them from there via the instructions in `AGENTS.md`.

### 4. Verify

```bash
ldev ai bootstrap --intent=develop --json
```

## Keeping skills up to date

After pulling a new version of `ldev`, re-run:

```bash
npx skills add https://github.com/mordonez/ldev
```

## Project-specific knowledge

Keep project-owned context outside these files:

- `docs/ai/project-context.md` — long-form project knowledge
- `.agents/skills/project-*` — project-scoped workflow skills
