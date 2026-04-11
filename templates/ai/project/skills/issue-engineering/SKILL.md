---
name: issue-engineering
description: 'Use when a project wants a thin issue-process overlay on top of vendor ldev skills for intake, human review handoff, evidence, and cleanup.'
---

# Issue Engineering

This skill is intentionally thin.

It does not own the technical `ldev` playbooks. Vendor skills do.

Use this overlay only for project-specific issue process:

- issue intake and scope notes
- worktree naming conventions if the project wants them and the runtime supports them
- temporary issue artifacts and handoff files
- human-review handoff expectations
- GitHub comments, evidence, and closure policy
- team-specific escalation and cleanup rules

For technical execution, always route to vendor skills:

- `troubleshooting-liferay`
- `developing-liferay`
- `deploying-liferay`
- `migrating-journal-structures`
- `automating-browser-tests`

## Boundary

This project skill must not become the canonical source for:

- discovery with `ldev portal inventory ...`
- runtime diagnosis with `ldev doctor`, `ldev context`, `ldev status`, or `ldev logs ...`
- export/import resource workflows
- deploy and runtime verification
- production-to-local reproduction workflows
- generic `ldev worktree` technical guidance

If that knowledge is reusable across `ldev` projects, move it into vendor
skills instead.

## Recommended usage

### 1. Intake

Review the issue in the tracker and capture only project-specific process data:

- issue number
- expected branch or worktree naming convention
- required reviewers or labels
- project evidence requirements
- project closure expectations

If technical discovery is required, switch immediately to the correct vendor
skill instead of documenting the flow here.

### 2. Reproduce

**This step is a hard gate. Do not proceed to worktree setup or code changes without it.**

Before writing any code, confirm the symptom exists in this environment:

- Use `playwright-cli` to open the affected URL and capture the failing state
- Save the screenshot as `.tmp/issue-NUM/before.png`
- If the symptom does not appear, stop and report to the user — the issue may already
  be fixed, may require specific data, or may not affect this environment

If the runtime is not available, explicitly block this step and tell the user
reproduction is pending. Do not proceed silently.

This is distinct from intake. Intake resolves the surface; reproduction confirms
the actual failure in the running environment.

### 3. Worktree isolation

**For `ldev-native` projects this step is mandatory, not optional.**
If the project defines agent invariants in `docs/ai/project-context.md`, those
invariants require a worktree before any code change or runtime mutation.
Do not skip this step regardless of whether the user asks to skip commits or
work in a lightweight mode.

**These justifications are invalid and must not be used to skip this step:**
- "We are already on a feature branch, not main" — branch isolation is not runtime isolation.
- "The change is small" — size does not waive the invariant.
- "The runtime is already running" — that is the main environment; it must not be mutated.
- "The user did not ask for a worktree" — the invariant applies regardless of user phrasing.

If you find yourself reasoning toward any of these, stop and create the worktree.

If isolated worktrees are available:

- prepare the isolated worktree with `ldev worktree setup --with-env`
- use project worktree naming conventions if the repository has them
- keep environment-specific cleanup tied to the actual worktree used

If the repository is a `blade-workspace`, do not invent a fake worktree phase.
Stay in the repository process flow and use vendor skills directly.

### 4. Technical execution

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

### 5. Validation is not optional

For runtime-backed resources (ADTs, templates, structures, fragments), browser
validation with Playwright is required before handoff — regardless of whether
the user asks to skip commits or work in a lightweight mode.

"No commit" only affects the final git step. It does not waive:

- import: `ldev resource import-*` for the changed resource
- runtime verification: `ldev portal check --json`, `ldev logs diagnose --json`
- browser validation: Playwright against the affected URL

If worktree isolation was skipped or the runtime is not available, explicitly
block this step and tell the user validation is pending rather than silently
omitting it.

### 6. Project handoff

After technical work is complete, apply the project process:

- write a human-review handoff in the repository's expected format
- include the verification steps the project wants reviewers to run
- attach screenshots or evidence if the project requires them
- wait for explicit human validation before opening a pull request or posting PR-related issue comments

### 7. Cleanup

Only apply cleanup rules that are specific to this repository's process.

If cleanup depends on technical `ldev` behavior, that guidance belongs in vendor
skills or `AGENTS.md`, not here.

## Allowed project-specific references

- `references/intake.md`
- `references/human-review-and-cleanup.md`
- `references/human-review-checklist.md`
- `references/worktree-env.md` only when `ldev-native` worktree capabilities are actually available
- `scripts/prepare_issue.py`
- project brief templates under `templates/`

## Disallowed drift

Do not add large technical runbooks here for:

- OSGi diagnosis
- page discovery
- resource ownership discovery
- export/import commands
- deploy command selection
- migration pipeline execution
- generic worktree troubleshooting

Those are reusable and must live in vendor-managed skills.
