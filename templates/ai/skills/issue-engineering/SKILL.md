---
name: issue-engineering
description: "Use when a GitHub issue in a project that runs with ldev must be handled end-to-end: intake, isolated worktree, discovery, fix, runtime verification, PR and cleanup."
---

# Issue Engineering

Use this skill to own the complete lifecycle of a GitHub issue: from reading it
to a merged PR. It orchestrates the other specialist skills through the `ldev`
runtime.

## Hard rules

- Always use an isolated worktree before touching tracked files.
- Always run portal discovery before searching code for IDs, keys or site names.
- Always verify changes with `ldev` against the real runtime, not just build output.
- Never clean the worktree before a verifiable PR exists.

## Required bootstrap

```bash
ldev doctor
ldev context --json
```

## Phase 1 — Intake

Read the issue and identify all affected surfaces:

```bash
gh issue view NUM
```

Look for:
- affected URLs or friendly paths (`/web/<site>/<page>`)
- structure keys, template IDs, ADT display styles, fragment keys
- bundle symbolic names or module paths
- expected vs actual behaviour

If URLs or resource identifiers are present, resolve them before reading code:

```bash
ldev liferay inventory page --url <fullUrl> --json
ldev liferay inventory structures --site /<site> --json
ldev liferay inventory templates --site /<site> --json
ldev liferay resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json
```

## Phase 2 — Worktree

Create an isolated worktree with its own runtime env:

```bash
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
ldev start
```

If the worktree already exists:

```bash
cd .worktrees/issue-NUM
ldev start
```

Verify the runtime is ready:

```bash
ldev status --json
ldev logs --since 2m --service liferay --no-follow
```

## Phase 3 — Fix

Apply the smallest change that resolves the issue. Use the appropriate specialist
skill based on the affected surface:

| Surface | Skill |
|---|---|
| Theme SCSS / JS / templates | `/developing-liferay` → theme path |
| OSGi module / Java | `/developing-liferay` → module path |
| Journal structures, templates, ADTs | `/developing-liferay` → resource path |
| Fragments | `/developing-liferay` → fragment path |
| Portal runtime unhealthy | `/troubleshooting-liferay` first |
| Journal content migration | `/migrating-journal-structures` |

Do not guess IDs or portal state. Run inventory commands to get current values.

## Phase 4 — Verify

After the fix, verify runtime state through `ldev`:

```bash
# Module changes
ldev deploy module <module-name>
ldev osgi status <bundle-symbolic-name> --json
ldev logs --since 2m --service liferay --no-follow

# Theme changes
ldev deploy theme
ldev logs --since 2m --service liferay --no-follow

# Resource changes (structures, templates, ADTs, fragments)
ldev liferay resource import-<type> --site /<site> --check-only
# If check passes:
ldev liferay resource import-<type> --site /<site>
ldev liferay inventory page --url <affectedUrl> --json
```

Use `/deploying-liferay` for the full verification flow when multiple artifacts
are involved.

Minimum bar before opening a PR:

- Build or import completed without errors.
- `ldev osgi status` confirms the expected bundle state (for module changes).
- `ldev logs --since 2m --no-follow` shows no new runtime errors caused by the change.
- The affected URL returns the expected result.

## Phase 5 — PR and comment

Create the PR from within the worktree:

```bash
gh pr create \
  --title "<concise title matching issue>" \
  --body "$(cat <<'EOF'
## Problem

<single sentence from the issue>

## Change

<what was changed and why it fixes the issue>

## Verified

<commands run: ldev deploy ..., ldev osgi ..., ldev logs ..., URL checked>

Closes #NUM
EOF
)"
```

Then comment on the issue to link the PR:

```bash
gh issue comment NUM --body "PR opened: #<PR_NUM>"
```

## Phase 6 — Cleanup

Only after the PR exists and is verifiable:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

## Guardrails

- If the env is unhealthy during Phase 2 or 3, stop and use `troubleshooting-liferay`.
- If the issue has weak technical context (no URLs, no surface names), run
  `ldev liferay inventory` commands to enrich it before writing code.
- Keep the worktree alive while the PR is under review if the reviewer may ask
  for follow-up changes.
- Use `--json` on all discovery and status commands when output will be consumed
  by scripts or downstream agents.
