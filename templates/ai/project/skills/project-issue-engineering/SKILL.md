---
name: project-issue-engineering
description: 'Wraps reusable ldev workflows with project issue intake, artifacts, review expectations, and handoff. Use when non-trivial repository issue work mutates code, resources, or runtime state.'
---

# Issue Engineering

This is the project-process wrapper. It owns issue intake, project artifacts,
review expectations, and handoff. Reusable technical gates live in vendor
skills.

## Start

1. Read `docs/ai/project-context.md` and `docs/ai/project-learnings.md` when
   they exist.
2. Capture project process facts only:
   - issue number or ad-hoc task name
   - branch/worktree naming convention
   - required reviewers, labels, evidence, or closure rules
3. If the task mentions portal URLs, resolve each one immediately:

```bash
ldev portal inventory page --url <fullUrl> --full --json
```

4. For non-trivial code, resource, or runtime mutations, switch to `runtime-change-workflow`.
   That vendor skill owns reproduction, worktree isolation, scope lock, route
   selection, smallest action, and verification.

## Project Artifacts

Use `.tmp/issue-<num>/` for temporary working evidence.

Create `brief.md` after worktree reproduction is known for `ldev-native`
projects, or after local reproduction is known for non-worktree projects:

- verified local URL or command
- observed vs expected symptom
- affected site, page, or resource
- blockers

Create `solution-plan.md` before the first edit:

- smallest intended fix path
- files and portal resources in scope
- validation plan
- vendor skill responsible for execution

If the planned scope touches Journal structures, Journal templates, ADTs, or
fragments, read `references/resource-origin.md` before scope lock. This keeps
project-specific source-of-truth facts visible before `portal-resource-workflow`
or `migrating-journal-structures` runs.

## Routing

- Generic Red -> Green gates -> `runtime-change-workflow`
- Portal resources -> `portal-resource-workflow`
- Risky Journal schema/data migration -> `migrating-journal-structures`
- Implementation -> `developing-liferay`
- Deploy/import verification -> `deploying-liferay`
- Browser reproduction/evidence -> `automating-browser-tests`
- Unknown failure -> `troubleshooting-liferay`

## Handoff

After the vendor workflow is Green, apply project handoff rules from
`references/human-review-and-cleanup.md`.

Do not declare completion when the vendor workflow reports missing reproduction,
missing import/deploy, missing read-after-write evidence, or blocked browser
validation.

## Project References

- `references/resource-origin.md`
- `references/intake.md`
- `references/github-visual-evidence.md`
- `references/human-review-and-cleanup.md`
- `references/human-review-checklist.md`
- `references/worktree-env.md` only for project naming or cleanup conventions
- project brief templates under `templates/`
