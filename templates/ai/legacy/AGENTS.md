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
ldev doctor --json
ldev context --json
```

If the runtime is not started yet:

```bash
ldev start
ldev status --json
```

## Worktree rule

If the task will change tracked files, use an isolated worktree.

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

Verify readiness before working:

```bash
ldev status --json
ldev logs --since 2m --service liferay --no-follow
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

- `/issue-engineering`: end-to-end GitHub issue lifecycle (vendor skill — installed by `ldev ai install`)
- `/liferay-expert`: technical Liferay routing when next step is unclear
- `/capturing-session-knowledge`: write verified project knowledge back to docs

## Local tooling contract

Use `ldev` as the official local CLI. Do not fall back to legacy `task ...`
wrappers or ad hoc Docker commands when an `ldev` command already exists.

```bash
ldev setup
ldev start
ldev stop
ldev status --json
ldev logs --since Xm --service liferay --no-follow
ldev shell
ldev worktree ...
ldev deploy ...
ldev osgi ...
ldev liferay ...
```

Use `--json` on `doctor`, `context`, `status` and other supported commands when
the output will be consumed by scripts or agents.

## Validation

After copying or updating this package in a real project, validate it with:

```bash
bash agents/validate-all.sh
```
