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
is **required**, not optional. Import success alone is not sufficient evidence:

```bash
playwright-cli -s=runtime-NUM screenshot --filename=.tmp/issue-NUM/before.png
# (apply fix and import)
playwright-cli -s=runtime-NUM screenshot --filename=.tmp/issue-NUM/after.png
```

If browser routing is wrong for the target virtual host, do not count an unrelated screenshot as evidence. Record visual validation as blocked and fall back to:

```bash
curl -I "<fullUrl>"
ldev logs --since 2m --no-follow
```
