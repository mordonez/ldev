# Agent Coverage Matrix

Coverage review for the most important human docs against the AI layer installed
by `ldev ai install`.

Interpretation:

- `covered`: the workflow is already operationalized well enough in installed
  `AGENTS.md`, vendor skills, or workspace rules.
- `partial`: the workflow intent is present, but important steps, commands, or
  guardrails still only exist in human docs.
- `missing`: the workflow is important but is not currently represented well in
  the installed AI layer.

## Current coverage

| Doc | Status | Installed AI coverage | Main gap | Recommended change |
| --- | --- | --- | --- | --- |
| `/getting-started/first-incident` | `covered` | `AGENTS.md`, `troubleshooting-liferay`, `developing-liferay`, `deploying-liferay` | The incident story itself is not captured as a named playbook, only as distributed guidance | Keep as docs-first narrative; optionally reference it from `troubleshooting-liferay` as the canonical example incident |
| `/workflows/diagnose-issue` | `covered` | `troubleshooting-liferay`, `AGENTS.md`, `ldev-runtime-troubleshooting` | Skills emphasize raw logs in one place instead of consistently preferring `ldev logs diagnose --json` | Align troubleshooting guidance to prefer `ldev logs diagnose --json` as the first diagnosis surface |
| `/workflows/reproduce-production-issue` | `covered` | `troubleshooting-liferay`, `AGENTS.md`, runtime rules | Production repro is now covered in vendor troubleshooting guidance, but examples may still need deep references later | Keep in vendor troubleshooting; add references only if the section grows too large |
| `/workflows/export-import-resources` | `covered` | `developing-liferay`, `deploying-liferay`, `ldev-resource-migrations` | Coverage is now explicit, but examples may later deserve a dedicated reference document | Keep in vendor skills unless the section becomes too large |
| `/workflows/explore-portal` | `covered` | `ldev-portal-discovery`, `developing-liferay`, `liferay-expert` | Coverage is correct but spread across rule plus skills | Keep as-is; optionally add a direct doc reference from `liferay-expert` |
| `/workflows/resource-migration-pipeline` | `covered` | `migrating-journal-structures`, `ldev-resource-migrations` | Docs previously implied cleanup could happen in one pass | Keep docs aligned with the safer skill sequencing |
| `/core-concepts/environments` | `covered` | `AGENTS.md`, `troubleshooting-liferay`, `ldev-native-runtime`, `ldev-workspace-setup` | None that materially blocks agent behavior after production repro was added to vendor troubleshooting | No urgent change |
| `/core-concepts/discovery` | `covered` | `AGENTS.md`, `ldev-portal-discovery`, `developing-liferay`, `liferay-expert` | None that materially blocks agent behavior | No urgent change |
| `/core-concepts/operations` | `covered` | `AGENTS.md`, `troubleshooting-liferay`, `deploying-liferay`, `developing-liferay` | None beyond wording consistency | Keep terminology aligned across docs and skills |
| `/core-concepts/structured-output` | `covered` | `AGENTS.md`, multiple skills, `ldev-portal-discovery` | A few examples still omit `--json` where agents benefit from it | Continue normalizing examples over time |
| `/agentic/` | `covered` | `AGENTS.md`, installed skills, workspace rules | No major gap after the vendor/project boundary was clarified | Keep doc accurate and avoid inflating the promise |
| `/advanced/worktrees` | `covered` | `AGENTS.md`, `troubleshooting-liferay`, `migrating-journal-structures`, runtime rules | Worktrees remain guidance rather than a required default in every workflow | Keep as reusable isolation guidance, not mandatory process |

## Main inconsistencies

### 1. Diagnosis entrypoint consistency

The intended diagnosis surface for agents is:

- `ldev logs diagnose --json`

Raw logs remain useful, but should stay secondary to the task-shaped diagnosis
summary.

### 2. Migration cleanup clarity

The safer sequencing is:

1. introduce the new shape
2. validate it
3. run cleanup only afterwards

Docs and skills should keep that order.

### 3. Vendor vs project boundary

Reusable `ldev` operational knowledge should live in vendor-managed skills.

Project overlays should only add:

- repository-specific process
- project-owned context
- project-specific GitHub or evidence conventions

## Recommended patch order

1. Keep strengthening vendor skills when an important workflow exists only in docs.
2. Keep project overlays thin and process-specific.
3. Prefer updating vendor skills before creating new ones.
4. Add references only when a vendor skill becomes too large for inline guidance.
