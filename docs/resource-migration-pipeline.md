# Resource Migration Pipeline

Liferay Journal structures often evolve after content already exists. Removing, renaming, or reorganizing fields can require migrating existing articles safely.

`ldev resource migration-pipeline` provides a plan-first workflow for these high-risk changes.

## Recommendation for speed

For day-to-day teams, the fastest path is usually:

1. modify the structure/template directly in Liferay UI,
2. verify quickly in runtime,
3. export the final result with `ldev`,
4. generate and run migration plan with `ldev`.

This avoids slow manual JSON/FTL editing when the intended change is easier to design in the UI.

## End-to-end example (UI-first + ldev migration)

Sample scenario (sanitized):

- Site: `/rankings`
- Structure: `ACME_STR_RANKING`
- Templates: `ACME_TPL_RANKING_DETAIL`, `ACME_TPL_RANKING_ITEM`
- Reference page: `/web/rankings/home`
- Isolated validation worktree: `.worktrees/structure-migration-e2e`

Functional change:

- remove `legacyRankingUrl`
- add `rankingUrl`
- add `ctaLabel`
- update detail template to render `rankingUrl` + `ctaLabel`

Target mapping:

```json
{
  "source": "legacyRankingUrl",
  "target": "rankingUrl",
  "cleanupSource": true
}
```

## 0) Mandatory bootstrap

```bash
ldev doctor
ldev context --json
ldev start
```

## 1) Discover current state

```bash
ldev portal inventory structures --site /rankings --json
ldev portal inventory templates --site /rankings --json
ldev resource structure --site /rankings --key ACME_STR_RANKING --json
ldev resource template --site /rankings --id ACME_TPL_RANKING_DETAIL --json
```

## 2) Apply functional change in runtime UI (recommended)

In Liferay UI:

- edit structure `ACME_STR_RANKING` and define final schema
- remove `legacyRankingUrl`
- add `rankingUrl`
- add `ctaLabel` (with default labels if needed)
- update `ACME_TPL_RANKING_DETAIL` to consume new fields

This is usually faster than editing JSON/FTL manually for first-pass design.

## 3) Export final structure/templates to repo

After UI changes are validated, export and commit the canonical files:

```bash
ldev resource export-structure --site /rankings --key ACME_STR_RANKING
ldev resource export-template --site /rankings --id ACME_TPL_RANKING_DETAIL
ldev resource export-template --site /rankings --id ACME_TPL_RANKING_ITEM
```

Expected files:

- `liferay/resources/journal/structures/rankings/ACME_STR_RANKING.json`
- `liferay/resources/journal/templates/rankings/ACME_TPL_RANKING_DETAIL.ftl`
- `liferay/resources/journal/templates/rankings/ACME_TPL_RANKING_ITEM.ftl`

## 4) Generate migration descriptor

```bash
ldev resource migration-init \
  --site /rankings \
  --key ACME_STR_RANKING \
  --templates \
  --overwrite \
  --json
```

Generated path:

```text
liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json
```

## 5) Adjust migration mappings

Edit descriptor and complete `introduce.mappings`:

```json
{
  "site": "/rankings",
  "structureKey": "ACME_STR_RANKING",
  "templates": true,
  "introduce": {
    "articleIds": ["2894560"],
    "folderIds": [],
    "rootFolderIds": [38152],
    "mappings": [
      {
        "source": "legacyRankingUrl",
        "target": "rankingUrl",
        "cleanupSource": true
      }
    ]
  }
}
```

Use `articleIds`, `folderIds` or `rootFolderIds` whenever you can. That keeps the migration fast, makes validation safer, and avoids scanning every structured content item in the site.

## 6) Preflight checks (no mutation)

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --check-only \
  --migration-dry-run \
  --json

ldev resource import-structure --site /rankings --key ACME_STR_RANKING --check-only --json
ldev resource import-template --site /rankings --id ACME_TPL_RANKING_DETAIL --check-only --json
```

If the actual apply step later hits an HTTP timeout, `ldev` performs a short recovery poll before declaring failure. When the updated structure shape is already visible in Liferay, the command reports the import as recovered instead of forcing a blind retry.

## 7) Validate in isolated worktree

```bash
ldev stop
ldev worktree setup --name structure-migration-e2e --base main --with-env --json
cd .worktrees/structure-migration-e2e
ldev env restore --json
ldev start
ldev env wait --timeout 120 --json
```

## 8) Run migration for real

Run the pipeline for the introduce/update phase:

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --json
```

If you also want cleanup of legacy fields marked for removal (`cleanupSource: true`), use `--run-cleanup`. That single execution runs introduce first and cleanup right after:

```bash
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --run-cleanup \
  --json
```

## 9) Final runtime and data validation

```bash
ldev resource structure --site /rankings --key ACME_STR_RANKING --json
ldev resource template --site /rankings --id ACME_TPL_RANKING_DETAIL --json
ldev portal inventory page --url /web/rankings/home --json
```

Validate at least one migrated content item through API:

```bash
curl -s -u 'CLIENT_ID:CLIENT_SECRET' \
  -d 'grant_type=client_credentials' \
  'http://localhost:8080/o/oauth2/token'

curl -s -H "Authorization: Bearer $TOKEN" \
  'http://localhost:8080/o/headless-delivery/v1.0/structured-contents/<id>'
```

Only close migration when schema + templates + migrated content values are confirmed.

## Checklist (short)

```bash
ldev doctor
ldev context --json
ldev start

# UI changes first (structure/template)

ldev resource export-structure --site /rankings --key ACME_STR_RANKING
ldev resource export-template --site /rankings --id ACME_TPL_RANKING_DETAIL
ldev resource migration-init --site /rankings --key ACME_STR_RANKING --templates --overwrite --json

ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --check-only --migration-dry-run --json

ldev worktree setup --name structure-migration-e2e --base main --with-env --json
cd .worktrees/structure-migration-e2e
ldev env restore --json
ldev start

ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --json

# optional second pass: remove legacy fields flagged for cleanup
ldev resource migration-pipeline \
  --migration-file liferay/resources/journal/migrations/rankings/ACME_STR_RANKING.migration.json \
  --run-cleanup --json
```

## Related docs

- [Key Capabilities](/capabilities)
- [Worktree Environments](/worktree-environments)
- [Command Reference](/commands)
- [Portal Inventory](/portal-inventory)
