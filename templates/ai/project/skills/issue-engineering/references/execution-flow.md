# Execution Flow

Use this reference for the full gate order once a task is confirmed to use the
project issue workflow.

## Recommended gate order

For `ldev-native` non-trivial tasks (bugs, features, migrations), follow this order:

1. `Red-1` reproduction in the current runtime
2. isolated worktree setup and active edit-root lock
3. `Red-2` reproduction in the worktree runtime
4. import/deploy verification with runtime evidence
5. `Red -> Green` visual validation on the same local URL

For clearly trivial tasks where the developer has explicitly defined the exact
scope, confirm with them whether the full gate applies or whether they prefer to
proceed directly. Never omit safety invariants such as `--check-only`,
read-after-write verification, or ID resolution regardless of which path is chosen.

For `blade-workspace`, keep the same intake and validation discipline but do not
invent a fake worktree phase.

## Reproduce before edits

This is a hard gate. Do not proceed to worktree setup or code changes without it.

Before writing any code, confirm the symptom exists in the local environment you
will use for the fix. If the runtime is not available, explicitly block this
step and tell the user reproduction is pending.

For `ldev-native`, this gate has two moments:

- `Red-1`: confirm the bug locally before creating the isolated worktree so the
  issue is real in the current project runtime
- `Red-2`: after the isolated worktree runtime is started, confirm the same
  symptom again there before editing code or importing resources

Do not treat a production screenshot as `Red`. Production evidence explains the
issue; local reproduction defines the bug you are actually fixing.

## Isolate the edit root

For `ldev-native` projects, worktree isolation is the strongly recommended default.
For non-trivial tasks, apply this step without negotiation. For clearly trivial
tasks where the developer explicitly requests lightweight mode, explain the risk
of working in the main checkout and ask for explicit go-ahead.

If isolated worktrees are available:

- use the vendor skill `isolating-worktrees` for setup, root lock, recovery,
  and cleanup
- use project worktree naming conventions if the repository has them
- read `worktree-env.md` only for project-specific conventions
- keep environment-specific cleanup tied to the actual worktree used
- after `ldev start`, reproduce the bug again in the worktree runtime before the
  first code change

If the repository is a `blade-workspace`, stay in the repository process flow
and use vendor skills directly.

## Lock scope before the first edit

Before writing any code or importing any resource, confirm the planned scope
matches exactly what the issue states:

1. List every file or resource you plan to change.
2. Annotate each item with the reason it appears in the issue description.
3. Remove any item that is not explicitly required or implied by the issue.
4. If you discover a field, layout, or resource that is not in the original
   scope, stop, add it to `solution-plan.md`, and surface it to the user before
   proceeding.

Common scope-creep traps:

- adding new structure fields when the issue only says to reorder or show/hide existing ones
- modifying a widget layout when the issue targets a template
- changing a CSS class globally when only one component is affected

Planning-time discovery is not authorization to expand scope.

## Prepare artifacts and route the technical work

Before routing technical work, prepare the issue artifacts this repository
expects under `.tmp/issue-<num>/`:

- `brief.md` — created after intake and `Red-1` reproduction; summarize the
  verified local URL, resolved surface, symptom checklist, and any hard blockers
- `solution-plan.md` — created only after the technical direction is known;
  capture the smallest intended fix path, validation plan, and the vendor skill
  that owns execution

These files are inputs for thin wrappers such as `issue-resolver`,
`build-verifier`, and `runtime-verifier`. Do not write them under `/tmp/`.

Route by task:

- vague failure or incident -> `troubleshooting-liferay`
- code, template, fragment, theme, or resource implementation -> `developing-liferay`
- deploy, import, and runtime verification -> `deploying-liferay`
- risky Journal schema migration -> `migrating-journal-structures`
- browser-based verification or visual evidence -> `automating-browser-tests`