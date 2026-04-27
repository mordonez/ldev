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

## Recommended gate order

For `ldev-native` non-trivial tasks (bugs, features, migrations), follow this order:

1. `Red-1` reproduction in the current runtime
2. isolated worktree setup and active edit-root lock
3. `Red-2` reproduction in the worktree runtime
4. import/deploy verification with runtime evidence
5. `Red -> Green` visual validation on the same local URL

For clearly trivial tasks where the developer has explicitly defined the exact scope,
confirm with them whether the full gate applies or whether they prefer to proceed
directly. Never omit safety invariants (--check-only, read-after-write, ID resolution)
regardless of which path is chosen.

For `blade-workspace`, keep the same intake and validation discipline but do
not invent a fake worktree phase.

## 1. Intake

Review the issue in the tracker and capture only project-specific process data:

- issue number
- expected branch or worktree naming convention
- required reviewers or labels
- project evidence requirements
- project closure expectations

If technical discovery is required, switch immediately to the correct vendor
skill instead of documenting the flow here.

Before leaving intake, scan the issue for ambiguous references to fields,
layouts, or components (ordinals like "el primero", cross-references like
"igual que X", vague selectors like "the description field"). If any are found,
apply the **Ambiguity Escape** in `references/intake.md` and ask the user for
the exact field key, structure ID, or layout section before proceeding to
reproduction.

## 2. Reproduce before edits

**This step is a hard gate. Do not proceed to worktree setup or code changes without it.**

Before writing any code, confirm the symptom exists in the local environment you
will use for the fix:

- resolve the reported issue URL to the local runtime first
- use `playwright-cli` on that local URL and capture the failing state
- save a full-page screenshot as `.tmp/issue-NUM/before.png`
- if the symptom does not appear, stop and report to the user; the issue may
  already be fixed, may require specific data, or may not affect this environment

If the runtime is not available, explicitly block this step and tell the user
reproduction is pending. Do not proceed silently.

This is distinct from intake. Intake resolves the surface; reproduction confirms
the actual failure in the running environment.

For `ldev-native`, this gate has two moments:

- `Red-1`: confirm the bug locally before creating the isolated worktree so the
  issue is real in the current project runtime
- `Red-2`: after the isolated worktree runtime is started, confirm the same
  symptom again there before editing code or importing resources

Do not treat a production screenshot as `Red`. Production evidence explains the
issue; local reproduction defines the bug you are actually fixing.

## 3. Isolate the edit root

**For `ldev-native` projects, worktree isolation is the strongly recommended default.**
For non-trivial tasks (bug fixes, features, migrations), apply this step without
negotiation. For clearly trivial tasks where the developer explicitly requests
lightweight mode, surface the recommendation, explain the risk of working in the
main checkout, and ask for their explicit go-ahead. Proceed per their answer.

If isolated worktrees are available:

- use the vendor skill `isolating-worktrees` for setup, root lock, recovery,
  and cleanup
- use project worktree naming conventions if the repository has them
- read `references/worktree-env.md` only for project-specific worktree
  conventions layered on top of that vendor skill
- keep environment-specific cleanup tied to the actual worktree used
- after `ldev start`, reproduce the bug again in the worktree runtime before the
  first code change

If the repository is a `blade-workspace`, do not invent a fake worktree phase.
Stay in the repository process flow and use vendor skills directly.

## 3.5. Lock scope before the first edit

**Before writing any code or importing any resource**, confirm the planned scope
matches exactly what the issue states:

1. List every file or resource you plan to change.
2. Annotate each item with the reason it appears in the issue description.
3. Remove any item that is not explicitly required or implied by the issue.
4. If you discover a field, layout, or resource that is not in the original scope,
   stop, add it to `solution-plan.md`, and surface it to the user before proceeding.

Common scope-creep traps:

- Adding new structure fields when the issue says to reorder or show/hide existing ones.
- Modifying a widget layout (grid columns, container) when the issue targets a template.
- Changing a CSS class globally when only one component is affected.

If during planning you discover a file, resource, or field that was not
mentioned or clearly implied by the issue, surface it to the user and update
`solution-plan.md` before proceeding. A planning-time discovery is not
authorization to expand scope.

## 4. Prepare artifacts and route the technical work

Before routing technical work, prepare the issue artifacts this repository
expects under `.tmp/issue-<num>/`:

- `brief.md` — created after intake and `Red-1` reproduction; summarize the
  verified local URL, resolved surface, symptom checklist, and any hard blockers
- `solution-plan.md` — created only after the technical direction is known;
  capture the smallest intended fix path, validation plan, and the vendor skill
  that owns execution

These files are the inputs for thin wrappers such as `issue-resolver`,
`build-verifier`, and `runtime-verifier`. Do not write them under `/tmp/`.

Route by task:

- vague failure or incident:
  - use `troubleshooting-liferay`
- code, template, fragment, theme, or resource implementation:
  - use `developing-liferay`
- deploy, import, and runtime verification:
  - use `deploying-liferay`
- risky Journal schema migration:
  - use `migrating-journal-structures`
- browser-based verification or visual evidence:
  - use `automating-browser-tests`

## 5. Validate Red -> Green before handoff

For runtime-backed resources (ADTs, templates, structures, fragments), browser
validation with Playwright is strongly recommended before handoff.

"No commit" only affects the final git step. It does not waive:

- import: `ldev resource import-*` for the changed resource
- runtime verification: `ldev portal check --json`, `ldev logs diagnose --json`
- browser validation: Playwright against the affected URL (recommended; if the
  developer explicitly opts out for a clearly trivial visual change they've already
  confirmed, note the skip and proceed per their instruction)

When reviewers need visual evidence directly in a GitHub issue or PR comment
without committing branch artifacts, read
`references/github-visual-evidence.md` before posting anything.

Validation must follow a visible `Red -> Green` loop:

- `Red`: capture the failing local state before the fix
- `Green`: verify the exact symptom checklist from the issue is now satisfied on
  the same local URL after the fix

A screenshot file existing is not enough. The agent must compare the issue's
expected/actual behaviors against the final page state and explicitly confirm
the symptom is gone.

**DOM counters (element counts, selector presence) are supplementary evidence
only.** A counter that returns `1` proves an element exists; it does not prove
the page looks correct. Visual validation is required in addition to any
scripted assertions.

**Side-by-side comparison is required before declaring Green:**

- Open `before.png` (captured at Red) and the new `after.png` side by side.
- Confirm every symptom from the issue description is no longer visible.
- Confirm no new visual regressions appear (unexpected layout shifts, overlapping
  elements, missing sections).

**Human confirmation is required before declaring Green:**

Do not self-declare the issue as fixed. Present the side-by-side evidence to the
user and wait for explicit confirmation. The phrase "looks good" or "visually
correct" from the user is the only valid gate to close the Red loop.

**Revert-first on regression:** If a symptom appears in `after.png` (or in
the running page) that was **not present in Red**, do not patch over it.

1. Identify which commit, import, or deploy introduced the new symptom.
2. Revert that unit to the pre-edit state (`git checkout <file>`, re-import
   the previous resource, or redeploy the previous artifact).
3. Confirm the regression is gone (the page matches Red, not a new broken state).
4. Then restart the fix with the new constraint understood.

Patching a regression with additional code accumulates invisible scope and
makes the final diff harder to review. Always shrink back to the known-good
baseline before trying again.

If worktree isolation was skipped or the runtime is not available, explicitly
block this step and tell the user validation is pending rather than silently
omitting it.

Do not declare completion if any gate above is missing. Missing evidence means
the task remains in `Red`.

## Project handoff

After technical work is complete, apply the project process:

- write a human-review handoff in the repository's expected format
- include the verification steps the project wants reviewers to run
- attach screenshots or evidence if the project requires them
- wait for explicit human validation before opening a pull request or posting PR-related issue comments

## Cleanup

Only apply cleanup rules that are specific to this repository's process.

If cleanup depends on technical `ldev` behavior, that guidance belongs in vendor
skills or `AGENTS.md`, not here.

## Allowed project-specific references

- `references/boundary-rules.md`
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
