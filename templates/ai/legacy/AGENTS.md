# AGENTS

Project-owned entrypoint for agents working in a repository that uses `ldev`.

This legacy package is meant to be layered on top of the standard reusable
`ldev ai install` package and then adapted locally. It intentionally keeps room
for project-specific context, GitHub workflow and Claude-specific runbooks.

## Required bootstrap

1. Read this file.
2. Read `CLAUDE.md`.
3. Run:

```bash
ldev doctor
ldev context --json
```

## Worktree rule

If the task will change tracked files, use an isolated worktree.

Recommended flow:

```bash
ldev worktree setup --name <name> --with-env
cd .worktrees/<name>
ldev start
```

If the worktree already exists:

```bash
cd .worktrees/<name>
ldev start
```

## Canonical locations

- Project know-how: `CLAUDE.md`
- Shared docs and validation: `agents/`
- Project and reusable skills: `.agents/skills/`
- Claude-specific runbooks: `.claude/agents/`

Precedence:

1. `AGENTS.md`
2. `CLAUDE.md`
3. `agents/`
4. `.agents/skills/`
5. `.claude/agents/`

## Recommended entry points

- `/issue-engineering`: end-to-end GitHub issue lifecycle for this project
- `/liferay-expert`: technical Liferay routing
- `/capturing-session-knowledge`: write back verified project knowledge

## Local tooling contract

Use `ldev` as the official local CLI:

- `ldev setup`
- `ldev start`
- `ldev stop`
- `ldev status`
- `ldev logs`
- `ldev shell`
- `ldev worktree ...`
- `ldev deploy ...`
- `ldev osgi ...`
- `ldev liferay ...`

Use `--json` on `doctor`, `context`, `status` and other supported commands when
the output will be consumed by scripts or agents.

## Validation

After copying or updating this package in a real project, validate it with:

```bash
bash agents/validate-all.sh
```
