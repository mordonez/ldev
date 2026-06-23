# Execution Flow

Use this reference only for project issue-process ordering. Reusable technical
gates are owned by `runtime-change-workflow`.

## Project Gate Order

1. Read project context and learnings.
2. Resolve issue number or ad-hoc task name.
3. For `ldev-native`, create or enter the isolated worktree before Red
   reproduction.
4. Create `.tmp/issue-<num>/brief.md`.
5. Create `.tmp/issue-<num>/solution-plan.md` before the first edit.
6. Switch to the vendor skill that owns execution.
7. Apply project handoff and cleanup rules after the vendor workflow is Green.

For `ldev-native` non-trivial tasks, `runtime-change-workflow` owns worktree
isolation first, then the single Red -> Green loop inside that worktree.
For `blade-workspace`, it keeps the same gates without inventing a fake worktree
phase.

## Route By Surface

- Generic mutating issue/feature/bug -> `runtime-change-workflow`
- Portal resources -> `portal-resource-workflow`
- Risky Journal schema/data migration -> `migrating-journal-structures`
- Implementation detail after scope is known -> `developing-liferay`
- Deploy/import/runtime proof after implementation exists -> `deploying-liferay`
- Browser-based verification or visual evidence -> `automating-browser-tests`
- Vague failure or incident -> `troubleshooting-liferay`

## Scope Lock Reminder

Before the first edit, list every file and portal resource in scope and tie each
one to issue wording or inventory evidence. Discovery is not authorization to
modify sibling/copy resources.
