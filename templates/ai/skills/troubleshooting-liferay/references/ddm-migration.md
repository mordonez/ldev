# DDM Migration Troubleshooting Reference

Use this reference when a render or import problem appears to come from a DDM structure change or an incomplete migration.

## Typical signals

- Articles stop rendering after a structure change
- FTL expects nested fields or separators that are no longer present
- Import looks successful but runtime data is inconsistent

## Recommended approach

1. Confirm current structure and template state from `ldev`
2. If there is real data risk, switch to `migrating-journal-structures`
3. Avoid destructive in-place changes without an explicit migration plan

## Useful commands

```bash
ldev portal inventory structures --site /<site> --json
ldev resource structure --site /<site> --key <STRUCTURE_KEY>
ldev resource template --site /<site> --id <TEMPLATE_ID>
ldev logs --since 10m --service liferay --no-follow
```

## Guardrails

- Do not jump to SQL or DB edits as a first move
- Do not assume an FTL failure is purely visual right after a structure change
