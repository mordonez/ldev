# Validation

Checklist to decide whether the fix is actually done.

## Operational Definition of Done

1. The original symptom no longer reproduces on the exact reported URL — verified
   by browser screenshot or explicit curl check, not inferred from import/deploy logs
2. No regressions appear in adjacent surfaces
3. If OSGi applies, the bundle is in the expected state
4. Recent logs do not show new errors caused by the change
5. There is enough evidence for human review

## Base Commands

```bash
ldev logs --since 2m --no-follow
```

If an OSGi module applies:

```bash
ldev osgi status <bundle> --json
ldev osgi diag <bundle> --json
```

If a portal resource applies:

```bash
ldev portal inventory page --url <fullUrl> --json
ldev resource structure --site /<site> --key <STRUCTURE_KEY>
ldev resource template --site /<site> --id <TEMPLATE_ID>
```

If the change affects a template, ADT, structure, or fragment — visual validation
is **required**, not optional. Import success alone is not sufficient evidence.

`before.png` must already exist from the reproduction step in intake. Do not
re-capture it here — that would overwrite the baseline taken before the fix.

```bash
# before.png already captured during intake/reproduction
# After applying the fix and importing:
playwright-cli -s=issue-NUM screenshot --filename=.tmp/issue-NUM/after.png
# Compare after.png with before.png to confirm the symptom is gone
```

If browser routing is wrong for the target virtual host, do not count an unrelated
screenshot as evidence. Record visual validation as blocked and use:

```bash
curl -I "<fullUrl>"
ldev logs --since 2m --no-follow
```
