# Project Overlay Audit

Audit of the optional `ldev ai install --project` layer.

Goal:

- keep reusable `ldev` knowledge in vendor-managed skills
- keep project overlays small and truly project-owned
- reduce overlap between project overlays and installed vendor skills

## Current project overlay surface

Installed with `--project` depending on project type:

- project-owned skills from `templates/ai/project/skills/`
- Claude agents from `templates/ai/project/.claude/agents/`

Current project-owned skills:

- `capturing-session-knowledge`
- `issue-engineering`

Current Claude agents:

- `build-verifier`
- `issue-resolver`
- `pr-creator`
- `runtime-verifier`

## Summary judgment

### Keep

- `capturing-session-knowledge`

Reason:

- it is clearly project-owned
- it writes back into `docs/ai/project-context.md`, `CLAUDE.md`, and
  `.agents/skills/project-*`
- it does not try to re-explain core `ldev` workflows

### Shrink or remove

- `issue-engineering`
- `build-verifier`
- `issue-resolver`
- `pr-creator`
- `runtime-verifier`

Reason:

- they encode a large end-to-end issue workflow rather than a small project
  overlay
- they repeat `ldev` operational knowledge already present or expected in vendor
  skills
- they mix `ldev` usage with GitHub issue lifecycle, PR policy, Playwright
  evidence, and worktree conventions
- that makes the optional `--project` layer feel like a second product

## What should move to vendor skills

These parts of `issue-engineering` are broadly reusable and belong in vendor
skills or `AGENTS.md`:

- never use `git worktree add`; prefer
  `ldev worktree setup --name <name> --with-env`
- discovery before code reading when a portal URL is already known
- local-first reproduction
- using `ldev portal inventory page --url ... --json` as the first page-context
  lookup
- validating bundle state after Java/OSGi changes
- using the smallest deploy/import that proves the fix
- isolating risky migration work in a dedicated worktree

Recommended destinations:

- `AGENTS.md`
  - keep the worktree guardrail and high-level routing only
- `troubleshooting-liferay`
  - absorb reproduction and discovery guidance
  - absorb the production-repro flow currently only documented in docs
- `developing-liferay`
  - absorb resource ownership discovery and export/import flow
- `deploying-liferay`
  - absorb the tighter validation checklist currently duplicated in project
    agents

## What should stay project-only

These parts are legitimately project-owned and should not move into vendor
skills:

- GitHub issue intake and comment workflow
- PR body structure and closure conventions
- attachment/evidence expectations in GitHub
- local temp-file conventions such as `/tmp/_issue_brief.md`
- orchestration between multiple Claude sub-agents
- retry policy and escalation format for a specific team workflow

If these remain useful, they should stay as a thin project automation layer, not
as the main source of `ldev` workflow knowledge.

## File-by-file decision

### `capturing-session-knowledge`

Decision:

- keep

Why:

- it captures project-owned facts into project-owned files
- it complements vendor skills instead of competing with them

### `issue-engineering`

Decision:

- shrink aggressively or remove

Why:

- too broad
- overlaps with `troubleshooting-liferay`, `developing-liferay`,
  `deploying-liferay`, and `migrating-journal-structures`
- couples `ldev` workflows to GitHub issue execution details

Recommended change:

- remove most `ldev` operational guidance from this skill
- if kept, rewrite it as a thin project orchestrator that says:
  - use vendor skills for technical work
  - use this overlay only for GitHub issue intake, PR format, evidence policy,
    and cleanup conventions

### `build-verifier`

Decision:

- shrink or remove

Why:

- duplicates `deploying-liferay`
- contains project-specific deploy assumptions such as `sync-template`
- encodes a sub-agent pipeline that is not needed in every project

### `issue-resolver`

Decision:

- shrink or remove

Why:

- duplicates routing, worktree setup, discovery, and fix planning already
  covered elsewhere
- embeds team process limits and artifact files into the core flow

### `pr-creator`

Decision:

- keep only if the project really wants automated PR conventions

Why:

- clearly project-process-specific
- not reusable as `ldev` product knowledge

### `runtime-verifier`

Decision:

- shrink or remove

Why:

- duplicates runtime verification already expected in `deploying-liferay` and
  `troubleshooting-liferay`
- mixes generic verification with project-specific evidence workflow

## Preferred end state

When someone asks "how should an agent use `ldev`?", the answer should come from
vendor skills.

When someone asks "how does this repo want issues and PRs handled?", the answer
may come from the optional project overlay.
