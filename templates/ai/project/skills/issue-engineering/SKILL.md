---
name: issue-engineering
description: 'Use for non-trivial tasks that mutate code, resources, or runtime state (GitHub issue, feature, bug fix, migration). For clearly trivial ad-hoc changes, confirm with the developer whether the full workflow applies before starting.'
---

# Issue Engineering

Use this skill for the project-specific issue process only.

It owns:

- issue intake and scope notes
- issue worktree naming conventions
- temporary issue artifacts and handoff files
- human-review expectations
- project-specific evidence, closure, and cleanup rules

For technical execution, always route to vendor skills:

- `troubleshooting-liferay`
- `developing-liferay`
- `deploying-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`

For `ldev-native`, this skill is the recommended default before technical execution
for non-trivial tasks (bug fixes, features, migrations) regardless of whether a
formal GitHub issue exists. For clearly trivial ad-hoc tasks where the developer
has explicitly scoped the change, confirm with them first — they may prefer to
skip intake and proceed directly.

For scope boundaries and invalid shortcuts, read
`references/boundary-rules.md` only when needed.

Use `references/execution-flow.md` for the full gate order, worktree phase,
scope lock, artifact preparation, and vendor-skill routing tree.

## 1. Intake

Review the issue in the tracker and capture only project-specific process data:

- issue number
- expected branch or worktree naming convention
- required reviewers or labels
- project evidence requirements
- project closure expectations

If technical discovery is required, switch immediately to the correct vendor
skill instead of documenting the flow here.

Use `references/intake.md` for URL resolution, ambiguity escape, and the exact
`before.png` capture flow.

## 2. Reproduce before edits

**This step is a hard gate. Do not proceed to worktree setup or code changes without it.**

Before writing any code, confirm the symptom exists in the local environment you
will use for the fix. If the runtime is not available, explicitly block this
step and tell the user reproduction is pending. Do not proceed silently.

This is distinct from intake. Intake resolves the surface; reproduction confirms
the actual failure in the running environment.

For the full `Red-1` / worktree / `Red-2` sequence, read
`references/execution-flow.md`.

## 3. Isolate the edit root

Worktree isolation is the strongly recommended default for `ldev-native`
non-trivial tasks.

```bash
ldev worktree setup --name <issue-id> --with-env --stop-main-for-clone --restart-main-after-clone
cd .worktrees/<issue-id>
ldev start
```

**Red-2 (hard gate):** After the worktree runtime is running, confirm the same
symptom again there before editing any code or importing any resource. This
ensures the bug reproduces in the isolated environment.

Do not proceed to edits until Red-2 passes. If the worktree runtime is not
available, explicitly block this step.

For project-specific branch naming, worktree naming conventions, and recovery
from setup blockers, see `references/execution-flow.md` and
`references/worktree-env.md`.

## 3.5. Lock scope before the first edit

Before writing any code or importing any resource:

1. List every file or resource you plan to change.
2. Annotate each item with the reason it appears in the issue description.
3. Remove any item not explicitly required or implied by the issue.
4. If you discover something outside the original scope, stop, add it to
   `solution-plan.md`, and surface it to the user before proceeding.

Common scope-creep traps: adding fields when the issue only asks to reorder
them; modifying a widget layout when the issue targets only a template; changing
a CSS class globally when only one component is affected.

## 4. Prepare artifacts and route the technical work

Before routing technical work, create these files under `.tmp/issue-<num>/`:

**`brief.md`** (after Red-1 and Red-2 reproduction):
- Verified local URL where the symptom reproduces
- What the symptom looks like (observed vs. expected)
- Which site, page, or resource is affected
- Any hard blockers

**`solution-plan.md`** (after technical direction is known):
- The smallest intended fix path
- Validation plan (commands + browser steps)
- Which vendor skill owns execution

Route by task type:
- Vague failure or unknown cause → `troubleshooting-liferay`
- Code, template, fragment, theme, or resource change → `developing-liferay`
- Deploy, import, or verification only → `deploying-liferay`
- Structure change that risks existing content → `migrating-journal-structures`

For the full gate order and routing tree, see `references/execution-flow.md`.

## 5. Validate before handoff

For runtime-backed resources (ADTs, templates, structures, fragments), browser
validation with Playwright is strongly recommended before handoff.

"No commit" only affects the final git step. It does not waive:

- import: `ldev resource import-*` for the changed resource
- runtime verification: `ldev portal check --json`, `ldev logs diagnose --json`
- browser validation: Playwright against the affected URL (recommended; if the
  developer explicitly opts out for a clearly trivial visual change they've already
  confirmed, note the skip and proceed per their instruction)

Use `references/validation.md` for the Red -> Green loop, explicit assertions,
and what counts as real evidence. When reviewers need evidence posted directly
to GitHub without committing artifacts, read
`references/github-visual-evidence.md` before posting anything.

If worktree isolation was skipped or the runtime is not available, explicitly
block this step and tell the user validation is pending rather than silently
omitting it.

Do not declare completion if any gate above is missing. Missing evidence means
the task remains in `Red`.

## Project handoff

After technical work is complete, apply the project process in
`references/human-review-and-cleanup.md`.

## Cleanup

Only apply cleanup rules that are specific to this repository's process. If
cleanup depends on technical `ldev` behavior, that guidance belongs in vendor
skills or `AGENTS.md`, not here.

## Allowed project-specific references

- `references/boundary-rules.md`
- `references/execution-flow.md`
- `references/issue-workflow-contract.md`
- `references/intake.md`
- `references/playwright-liferay.md`
- `references/validation.md`
- `references/github-visual-evidence.md`
- `references/human-review-and-cleanup.md`
- `references/human-review-checklist.md`
- `references/worktree-env.md` only when `ldev-native` worktree capabilities are actually available
- `scripts/prepare_issue.py`
- project brief templates under `templates/`
