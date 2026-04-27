# AGENTS

Standard entrypoint for coding agents working in a project that uses `ldev`.

This file is intentionally small. It defines the stable bootstrap and points to
the reusable skills installed by `ldev`.

## Required Bootstrap

Before changing code or runtime state:

1. Run `ldev doctor`.
2. Run `ldev context --json`.
3. Read the task-specific skill under `.agents/skills/` if one applies.

Use `ldev --help` as the source of truth for the public CLI surface.

## Default Operating Rules

- Use `ldev` as the official entrypoint. Do not fall back to legacy wrappers or
  ad hoc project scripts when an `ldev` command already exists.
- Prefer top-level commands for daily work:
  - `ldev setup`
  - `ldev start`
  - `ldev stop`
  - `ldev status`
  - `ldev logs`
  - `ldev shell`
- Use namespaces only when you need explicit control:
  - `ldev worktree ...`
  - `ldev deploy ...`
  - `ldev db ...`
  - `ldev osgi ...`
  - `ldev liferay ...`
- For scripting and agents, prefer machine-readable output:
  - `ldev doctor --json`
  - `ldev context --json`
  - `ldev status --json`

## Project-Specific Knowledge

`ldev` installs reusable skills, not project-specific know-how.

If a repository needs local conventions, create project-owned docs such as:

- `PROJECT_AI.md`
- `docs/ai/`
- extra skills under `.agents/skills/<project>-*`

Keep that local context in the project repo, not in `ldev`.

## Installed Skills

Use these as the standard reusable entrypoints:

- `issue-engineering`: end-to-end GitHub issue lifecycle — worktree, fix, verify, PR.
- `liferay-expert`: router for technical Liferay work when the next step is not yet clear.
- `developing-liferay`: implementation guidance for code, themes, content resources and fragments.
- `deploying-liferay`: build, deploy and runtime verification flow.
- `troubleshooting-liferay`: diagnosis and recovery when the env is unhealthy.
- `migrating-journal-structures`: safe Journal structure and content migration playbook.

## Validation

After installing or updating vendor skills:

1. Review `.agents/skills/`.
2. Add any project-owned skills with a project prefix.
3. Keep project-specific prompts and runbooks outside the vendor-managed surface.
