# Verify Skills — Auto-Maintenance Workflow

Detects drift between installed `ldev` skills and the actual CLI command surface.
Run this after any ldev CLI release or after editing SKILL.md files.

## When to Use

- After `npm install @mordonezdev/ldev` updates the CLI version
- After editing a skill that references specific `ldev` commands or flags
- When a skill produces incorrect agent behavior (may indicate a stale command reference)

## Steps

### 1. Collect the live CLI surface

```bash
ldev --help
ldev portal --help
ldev resource --help
ldev osgi --help
ldev deploy --help
ldev worktree --help
ldev db --help
ldev env --help
ldev ai --help
```

Save the output or process it in-context.

### 2. Collect all skill files

```
skills/*/SKILL.md
```

For each SKILL.md, extract:
- Every `ldev ...` command reference (commands, flags, options)
- Every flag name mentioned in examples (e.g. `--check-only`, `--all-sites`, `--out`)

### 3. Compare references against live CLI

For each command reference found in a skill:
1. Check that the command namespace exists in the live `--help` output
2. Check that each flag mentioned in the skill exists in that command's `--help`
3. Flag discrepancies: renamed commands, removed flags, changed flag syntax

### 4. Report and fix

For each discrepancy found:
- Name the skill file and the line with the stale reference
- Show the current CLI output for that command
- Propose the corrected command/flag syntax

Update the affected SKILL.md files with the correct commands.

### 5. Verify the fix

After updating, re-run the affected skill's example commands against a running portal (if available) or verify the `--help` output matches the updated skill.

## Out of Scope

- Changing command behavior (only documentation drift)
- Updating `agents/openai.yaml` files (do these manually when skill names change)
- Checking for new commands not yet documented (create a separate task for gap filling)

## Example Discrepancy Report

```
DRIFT DETECTED in skills/portal-resource-workflow/SKILL.md:
  Line 22: `ldev resource export-structure --site /<site> --structure <KEY>`
  Status: Command `export-structure` still exists but prefer `resource structure --out`
  Action: Update skill to use `ldev resource structure --site /<site> --structure <KEY> --out`

DRIFT DETECTED in skills/ldev-reindex/SKILL.md:
  Line 31: `ldev portal reindex speedup-on`
  Status: Command verified ✓
```
