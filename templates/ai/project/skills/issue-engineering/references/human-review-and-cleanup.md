# Human Review Handoff and Cleanup

Short reference for disciplined issue closure.

## Commit and Handoff

```bash
git add <specific-files>
git commit -m "fix(scope): description (#NUM)"
```

Do not push, open a pull request, or comment that a PR exists until a human has
validated the work and explicitly asked you to do that.

## Minimum Handoff Body

- First line: `Closes #NUM` or `Fixes #NUM`
- What the fix does
- How to verify it step by step
- Deployment notes if the change requires import or migration outside local
- Visual evidence if the issue was UI
- `Validated`
- `Not validated`
- `Unknowns`

For runtime-backed resources such as templates, ADTs, structures, or fragments,
the deployment notes must include:

- the preferred `ldev` promotion path when available
- the equivalent manual Liferay UI fallback when remote `ldev` access is not guaranteed
- the exact site scope and resource identifiers needed to find the same object
- a note that this is a runtime resource change and must not be applied through
  theme or module deploy

Use `runtime-resource-handoff-template.md` as the default structure and
`../../../../skills/developing-liferay/references/runtime-resource-production-handoff.md`
for the resource-specific fallback rules.

`Validated` should contain only checks you actually executed.

`Not validated` should contain anything you expected to verify but could not.

`Unknowns` should contain remaining doubts, alternative ownership hypotheses, or
risks that still need a human eye.

Do not write a resolved-sounding handoff if `Not validated` or `Unknowns`
contains anything material to the issue.

## Human Approval Gate

After preparing the handoff, stop and ask for human validation. The human should
review the diff, evidence, and verification steps before any pull request is
opened or any PR-related issue comment is posted.

## Cleanup

Only after human validation, and only if this repository actually used an
isolated worktree for the issue:

```bash
ldev stop
cd ../..
ldev worktree clean issue-NUM --force
```

If no isolated worktree was used, apply only the repository's normal issue
cleanup steps.
