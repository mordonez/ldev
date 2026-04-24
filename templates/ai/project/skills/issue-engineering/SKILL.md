---
name: issue-engineering
description: 'Use for any task that can mutate code, resources, or runtime state in this project (GitHub issue, chat request, or ad-hoc), to enforce intake/reproduction gates, evidence, and human handoff.'
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

For `ldev-native`, this skill is mandatory before technical execution whenever
the task mutates code, resources, or runtime state, even without a formal
GitHub issue.

For scope boundaries and invalid shortcuts, read
`references/boundary-rules.md` only when needed.

## Hard gates

For `ldev-native` mutating tasks, execute this order without skipping:

1. `Red-1` reproduction in the current runtime
2. isolated worktree setup and active edit-root lock
3. `Red-2` reproduction in the worktree runtime
4. import/deploy verification with runtime evidence
5. `Red -> Green` visual validation on the same local URL

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

**For `ldev-native` projects this step is mandatory, not optional.**
If the project defines agent invariants in `docs/ai/project-context.md`, those
invariants require a worktree before any code change or runtime mutation.
Do not skip this step regardless of whether the user asks to skip commits or
work in a lightweight mode.

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
validation with Playwright is required before handoff regardless of whether
the user asks to skip commits or work in a lightweight mode.

"No commit" only affects the final git step. It does not waive:

- import: `ldev resource import-*` for the changed resource
- runtime verification: `ldev portal check --json`, `ldev logs diagnose --json`
- browser validation: Playwright against the affected URL

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
