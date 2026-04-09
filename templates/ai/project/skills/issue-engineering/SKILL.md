---
name: issue-engineering
description: 'Use when a project wants a thin issue-process overlay on top of vendor ldev skills for intake, PR policy, evidence, and cleanup.'
---

# Issue Engineering

This skill is intentionally thin.

It does not own the technical `ldev` playbooks. Vendor skills do.

Use this overlay only for project-specific issue process:

- issue intake and scope notes
- worktree naming conventions if the project wants them
- temporary issue artifacts and handoff files
- PR body expectations
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

### 2. Technical execution

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

### 3. Project handoff

After technical work is complete, apply the project process:

- write the PR body in the repository's expected format
- include the verification steps the project wants reviewers to run
- attach screenshots or evidence if the project requires them
- comment back on the issue if the project expects a status update

### 4. Cleanup

Only apply cleanup rules that are specific to this repository's process.

If cleanup depends on technical `ldev` behavior, that guidance belongs in vendor
skills or `AGENTS.md`, not here.

## Allowed project-specific references

- `references/intake.md`
- `references/pr-and-cleanup.md`
- `references/human-review-checklist.md`
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
