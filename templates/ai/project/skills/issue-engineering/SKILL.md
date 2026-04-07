---
name: issue-engineering
description: "Use when resolving any GitHub issue end-to-end: intake, isolated worktree, reproduction, fix, validation, PR, and cleanup. Single skill for issue resolution."
---

# Issue Engineering

Single guide for the full issue lifecycle. These guardrails are **non-negotiable**.

---

## Hard Guardrails

| Rule | Do not do | Do |
|---|---|---|
| **Isolation** | Work in `main` | `ldev worktree setup --name issue-NUM --with-env` |
| **Worktree creation** | `git worktree add` | `ldev worktree setup --name issue-NUM --with-env` — never use git directly; `ldev` adds env isolation on top |
| **Cleanup** | `rm -rf .worktrees/NUM` | `ldev worktree clean issue-NUM --force` |
| **Discovery** | Broad code search when the issue already has a URL | `ldev portal inventory page --url <URL>` first |
| **Playwright** | Connect to production without local verification | Local first; production only on explicit request |
| **Closure** | Clean the worktree before a PR exists | PR first, cleanup second |
| **Worktree state** | Stop `main` without asking | If the guardrail says `main` is running without Btrfs, ask for confirmation before running `ldev stop` in `main` |

---

## Setup Reference Sequence

Typical command sequence for issue-driven work:

```bash
ldev doctor --json
ldev context --json
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
ldev start
ldev status --json
```

## Phase 0 — Intake (Optional if the issue is already clear)

Extended reference: `references/intake.md`

If the issue includes URLs but lacks technical context:

```bash
gh issue view NUM --json title,body,labels,comments
```

For each URL in the body:
```bash
ldev portal inventory page --url <URL> --json
```

If there are no exact URLs:
```bash
ldev portal inventory sites --json
ldev portal inventory pages --site /<site> --json
```

Add only verified context back to the issue. Mark unresolvable URLs as `NOT_VERIFIED`.

Minimum intake checklist:

- title, body, and labels reviewed
- affected URLs verified with `ldev`
- `displayStyle` or affected resource resolved if it appears in the issue
- unverified scope explicitly marked as `NOT_VERIFIED`

Stop conditions during intake:

- If you have exact URLs and have not run `ldev portal inventory page --url <URL> --json`, stop broad discovery.
- If you are comparing local and non-local environments without explicit user approval, stop and return to local verification.
- If you cannot name the concrete resource owner for the affected surface, keep discovery going; do not jump into template or CSS edits.

---

## Phase 1 — Isolation (Required)

Extended reference: `references/worktree-env.md`

**Never** work in `main` or in the repo root.
Do not continue to discovery, code reading, editing, deploy, or import until you confirm
that the current directory is the issue worktree.

```bash
ldev worktree setup --name issue-NUM --with-env
cd .worktrees/issue-NUM
pwd
git rev-parse --show-toplevel
ldev start
ldev status --json
```

Quick inspection of the isolated environment:

```bash
ldev context --json
ldev logs --since 5m --no-follow
```

Required gate:
- If `pwd` or `git rev-parse --show-toplevel` does not point to `.worktrees/issue-NUM`, stop.
- In that case: **ESCALATE**. Do not improvise work from the main checkout.
- If `ldev status --json` is not healthy enough to reproduce locally, stop and fix runtime readiness before discovery.

If the unsafe state-copy guardrail appears (`main` running without Btrfs), stop and ask the user before stopping `main`. Do not do it automatically.

If the worktree database becomes inconsistent:
```bash
ldev stop
ldev env restore
ldev start
```

If you only need to prepare, inspect, or repair the worktree, this skill still covers that workflow.

Required gate: do not run `ldev portal ...`, `playwright-cli`, or `curl` against the portal
until you have run `ldev start` + `ldev status --json` from the worktree.

---

## Phase 2 — Discovery and Reproduction

Extended references:
- `references/playwright-liferay.md`
- `references/resource-origin.md` when the runtime URL, shared structure, and template source do not obviously belong to the same site

**Before reading code**, reproduce the failure and understand the affected surface.

```bash
# If the issue has an exact URL, this is required first
ldev portal inventory page --url <URL> --json

# If there is a displayStyle: ddmTemplate_<ID>
ldev resource resolve-adt --display-style ddmTemplate_<ID> --site /<site> --json

# Logs for backend errors
ldev logs --since 10m --no-follow

# Visual verification
playwright-cli -s=runtime-NUM open "<portalUrl>/affected-path"
playwright-cli -s=runtime-NUM screenshot --filename=.tmp/issue-NUM/before.png
playwright-cli -s=runtime-NUM close
```

If you cannot reproduce the issue, ask for more information. Do not fix what you have not seen broken.

Discovery anti-patterns:

- Do not start with broad code search when an exact portal URL already exists.
- Do not infer the owning template from similar pages in other environments before inventorying the reported URL.
- Do not compare against production or preproduction as a substitute for local reproduction.
- Do not keep reading neighboring templates once `displayStyle`, structure, or resource ownership has been resolved.

---

## Phase 3 — Resolution

| Change type | Skill | Deploy |
|---|---|---|
| CSS / Theme | `developing-liferay` | `ldev deploy theme` |
| Structures / Templates / ADTs | `developing-liferay` | `ldev resource import-structure` / `import-template` / `import-adt` |
| Java / OSGi | `developing-liferay` | `ldev deploy module <name>` |
| Data migration | `migrating-journal-structures` | — |

Make surgical changes. Do not touch code outside the fix surface.
If validation is blocked by an unrelated runtime failure, stop the functional fix there, open or link a separate runtime issue, and do not silently fold that stabilization work into the original issue.

Minimum briefs by change type:

- CSS/Theme: affected URL, affected selector, expected behavior, validation with `ldev deploy theme`
- FTL/Resource: site, structure key, template id/key, verification source via `ldev portal inventory ...` or `ldev resource ...`
- Java/OSGi: module, bundle symbolic name, validation with `ldev deploy module <name>` + `ldev osgi status <bundle> --json`

Templates:

- `templates/css-brief-template.md`
- `templates/ftl-brief-template.md`
- `templates/java-module-brief-template.md`

---

## Phase 4 — Validation (Definition of Done)

Extended reference: `references/validation.md`

A fix is not done until:

1. The original error no longer reproduces on the exact reported URL.
2. There are no regressions in adjacent surfaces.
3. `ldev osgi status <bundle> --json` reports `ACTIVE` when applicable.
4. `ldev logs --since 2m --no-follow` shows no new errors.
5. Playwright evidence is captured and attached in GitHub.

Human checklist before closing:

- the original symptom is gone
- the change stayed scoped to the intended surface
- runtime validation was done with `ldev`
- no new errors appeared in recent logs

---

## Phase 5 — PR and Closure

Extended reference: `references/pr-and-cleanup.md`

```bash
# Commit (from the worktree)
git add <specific-files>
git commit -m "fix(scope): description (#NUM)"

# PR
git push origin fix/issue-NUM
gh pr create --title "fix(scope): description (#NUM)" --body $'Closes #NUM\n\n...'

# Comment back on the issue
gh issue comment NUM --body "Fix in PR #<NUM>. [link to evidence]"
```

Required PR body:
- First line: `Closes #NUM` or `Fixes #NUM`
- What the fix does
- How to verify it step by step
- Deployment notes if `ldev resource ...` steps are needed in other environments
- Visual evidence attached in GitHub

---

## Phase 6 — Cleanup

Only after a verifiable PR exists:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

---

## Pipeline Troubleshooting

| Symptom | Action |
|---|---|
| Port already in use in `ldev start` | `ldev status --json` — another worktree is active |
| Unstable env / inconsistent DB | `ldev stop` → `ldev env restore` → `ldev start` |
| Playwright: browser not installed | `node "$(npm root -g)/@playwright/cli/node_modules/playwright/cli.js" install chromium` |
| Playwright: session-busy | Sequence commands, do not run them in parallel |
| Blocked and unable to close | Comment on the issue with verified findings and what is still needed to unblock |

## Auxiliary Resources

- `references/human-review-checklist.md`
- `references/resource-origin.md`
- `scripts/prepare_issue.py`

Use these files as support material. Keep this `SKILL.md` as the high-level
master flow, not as a dump of operational detail.
